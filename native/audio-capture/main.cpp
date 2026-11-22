// Ferret audio capture helper (Windows 11 / build 20348 and newer).
//
// Captures the sound of one app (and the apps it started), or of
// everything except one app, using Windows' process loopback. Ferret uses
// it to give a screen share only the shared app's sound, or all sound
// except Ferret's own (so the call doesn't echo back to viewers).
//
//   ferret-audio-capture --window <hwnd>   that window's app only
//   ferret-audio-capture --include <pid>   that process tree only
//   ferret-audio-capture --exclude <pid>   everything except that tree
//
// Writes raw 48 kHz, 16-bit, stereo PCM to stdout until stdin closes (when
// Ferret stops it or goes away). Errors go to stderr with exit code 1.
// It only reads sound; it never records the microphone or saves anything.

#include <windows.h>

#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/implements.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

using Microsoft::WRL::ClassicCom;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;

namespace {

constexpr DWORD kSampleRate = 48000;
constexpr WORD kChannels = 2;
constexpr WORD kBytesPerSample = 2;
constexpr DWORD kFrameBytes = kChannels * kBytesPerSample;

HANDLE gStdout = INVALID_HANDLE_VALUE;
volatile LONG gQuit = 0;

int Fail(const char* what, HRESULT hr) {
  std::fprintf(stderr, "%s failed (0x%08lx)\n", what,
               static_cast<unsigned long>(hr));
  return 1;
}

// Waits for ActivateAudioInterfaceAsync to finish
class ActivationHandler
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase,
                          IActivateAudioInterfaceCompletionHandler> {
 public:
  ActivationHandler() { done_ = CreateEventW(nullptr, TRUE, FALSE, nullptr); }
  ~ActivationHandler() override {
    if (done_) CloseHandle(done_);
  }

  STDMETHOD(ActivateCompleted)
  (IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activated = E_FAIL;
    ComPtr<IUnknown> unknown;
    result_ = operation->GetActivateResult(&activated, &unknown);
    if (SUCCEEDED(result_)) result_ = activated;
    if (SUCCEEDED(result_)) result_ = unknown.As(&client_);
    SetEvent(done_);
    return S_OK;
  }

  HRESULT Wait(ComPtr<IAudioClient>& client) {
    if (WaitForSingleObject(done_, 10000) != WAIT_OBJECT_0) return E_ABORT;
    client = client_;
    return result_;
  }

 private:
  HANDLE done_ = nullptr;
  HRESULT result_ = E_FAIL;
  ComPtr<IAudioClient> client_;
};

// Stop when Ferret closes our stdin (or exits)
DWORD WINAPI WatchStdin(LPVOID) {
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  char buffer[64];
  DWORD read = 0;
  while (ReadFile(in, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
  }
  InterlockedExchange(&gQuit, 1);
  return 0;
}

bool WriteAll(const void* data, DWORD size) {
  const char* bytes = static_cast<const char*>(data);
  while (size > 0) {
    DWORD written = 0;
    if (!WriteFile(gStdout, bytes, size, &written, nullptr) || written == 0)
      return false;
    bytes += written;
    size -= written;
  }
  return true;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc != 3) {
    std::fprintf(stderr,
                 "usage: ferret-audio-capture --window <hwnd> | --include "
                 "<pid> | --exclude <pid>\n");
    return 1;
  }

  const wchar_t* option = argv[1];
  const unsigned long long value = _wcstoui64(argv[2], nullptr, 10);
  DWORD pid = 0;
  bool include = true;

  if (std::wcscmp(option, L"--window") == 0) {
    HWND window = reinterpret_cast<HWND>(static_cast<ULONG_PTR>(value));
    if (!IsWindow(window) || !GetWindowThreadProcessId(window, &pid) ||
        pid == 0) {
      std::fprintf(stderr, "window not found\n");
      return 1;
    }
  } else if (std::wcscmp(option, L"--include") == 0) {
    pid = static_cast<DWORD>(value);
  } else if (std::wcscmp(option, L"--exclude") == 0) {
    pid = static_cast<DWORD>(value);
    include = false;
  } else {
    std::fprintf(stderr, "unknown option\n");
    return 1;
  }
  if (pid == 0) {
    std::fprintf(stderr, "no process\n");
    return 1;
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return Fail("CoInitializeEx", hr);

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      include ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
              : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activation = {};
  activation.vt = VT_BLOB;
  activation.blob.cbSize = sizeof(params);
  activation.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto handler = Microsoft::WRL::Make<ActivationHandler>();
  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                                   __uuidof(IAudioClient), &activation,
                                   handler.Get(), &operation);
  if (FAILED(hr)) return Fail("ActivateAudioInterfaceAsync", hr);

  ComPtr<IAudioClient> client;
  hr = handler->Wait(client);
  if (FAILED(hr)) return Fail("activate process loopback", hr);

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBytesPerSample * 8;
  format.nBlockAlign = static_cast<WORD>(kFrameBytes);
  format.nAvgBytesPerSec = kSampleRate * kFrameBytes;

  // 20 ms buffer, in 100-nanosecond units
  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                          AUDCLNT_STREAMFLAGS_LOOPBACK |
                              AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                              AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                          200000, 0, &format, nullptr);
  if (FAILED(hr)) return Fail("IAudioClient::Initialize", hr);

  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  hr = client->SetEventHandle(ready);
  if (FAILED(hr)) return Fail("SetEventHandle", hr);

  ComPtr<IAudioCaptureClient> capture;
  hr = client->GetService(IID_PPV_ARGS(&capture));
  if (FAILED(hr)) return Fail("GetService", hr);

  gStdout = GetStdHandle(STD_OUTPUT_HANDLE);
  CreateThread(nullptr, 0, WatchStdin, nullptr, 0, nullptr);

  hr = client->Start();
  if (FAILED(hr)) return Fail("Start", hr);

  std::vector<char> silence;
  while (!gQuit) {
    // wakes up when sound is ready; with nothing playing, nothing is sent
    // and Ferret plays silence
    if (WaitForSingleObject(ready, 200) != WAIT_OBJECT_0) continue;

    UINT32 packet = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&packet)) && packet > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) return Fail("GetBuffer", hr);

      const DWORD bytes = frames * kFrameBytes;
      bool ok = true;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        if (silence.size() < bytes) silence.assign(bytes, 0);
        ok = WriteAll(silence.data(), bytes);
      } else {
        ok = WriteAll(data, bytes);
      }
      capture->ReleaseBuffer(frames);
      // Ferret stopped reading: we're done
      if (!ok) {
        InterlockedExchange(&gQuit, 1);
        break;
      }
    }
  }

  client->Stop();
  CoUninitialize();
  return 0;
}
