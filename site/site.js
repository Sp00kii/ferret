// Small bits of life for the Ferret website. Everything still works without it.
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- sounds ----
  let playing;
  function play(src, button, loop) {
    if (playing) {
      playing.audio.pause();
      playing.button?.classList.remove("playing");
      playing.button?.setAttribute("aria-pressed", "false");
      const same = playing.button === button;
      playing = undefined;
      if (same && loop) return; // second press stops the ringtone
    }
    const audio = new Audio(src);
    audio.loop = !!loop;
    audio.volume = 0.6;
    audio.play().catch(() => {});
    button?.classList.add("playing");
    if (loop) button?.setAttribute("aria-pressed", "true");
    playing = { audio, button };
    audio.addEventListener("ended", () => {
      button?.classList.remove("playing");
      if (playing?.audio === audio) playing = undefined;
    });
  }

  document.querySelectorAll("[data-clip]").forEach((button) =>
    button.addEventListener("click", () =>
      play(`assets/${button.dataset.clip}.ogg`, button),
    ),
  );

  const ring = document.getElementById("ring");
  ring.addEventListener("click", () => {
    play("assets/dook-ring.ogg", ring, true);
    ring.textContent = ring.getAttribute("aria-pressed") === "true" ? "Stop ringtone" : "Play ringtone";
  });

  const mute = document.getElementById("mute");
  mute.addEventListener("click", () => {
    const on = mute.getAttribute("aria-pressed") !== "true";
    mute.setAttribute("aria-pressed", String(on));
    mute.textContent = on ? "Unmute" : "Mute";
    const me = document.querySelector("#people li");
    me.toggleAttribute("data-speaking", false);
    me.dataset.muted = on ? "1" : "";
  });

  // ---- the toast's reply box ----
  const form = document.getElementById("reply");
  const input = document.getElementById("reply-text");
  const status = document.getElementById("reply-status");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    input.value = "";
    status.textContent = "Sent! (Well, not really. This is just the website.)";
    play("assets/message.ogg");
  });

  // ---- who's talking: pass the green ring around ----
  if (!reduceMotion) {
    const people = [...document.querySelectorAll("#people li")].slice(0, 2);
    let turn = 0;
    setInterval(() => {
      turn = (turn + 1) % people.length;
      people.forEach((li, i) => {
        const muted = li.dataset.muted === "1";
        li.toggleAttribute("data-speaking", i === turn && !muted);
      });
    }, 1600);
  }

  // ---- call timer ----
  const time = document.getElementById("call-time");
  let seconds = 12 * 60 + 41;
  setInterval(() => {
    seconds += 1;
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, "0");
    time.textContent = `Ferret Den, ${m}:${s}`;
  }, 1000);

  // ---- download links: point at the newest release's files ----
  fetch("https://api.github.com/repos/Sp00kii/ferret/releases/latest")
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((release) => {
      const find = (test) => release.assets.find((asset) => test(asset.name));
      const windows = find((name) => /setup\.exe$/i.test(name));
      const deb = find((name) => /\.deb$/i.test(name));
      const arm = find((name) => /arm64\.exe$/i.test(name));
      if (arm) {
        const link = document.getElementById("dl-arm");
        link.href = arm.browser_download_url;
        link.hidden = false;
      }
      if (windows) document.getElementById("dl-windows").href = windows.browser_download_url;
      const linux = document.getElementById("dl-linux");
      if (deb) {
        linux.href = deb.browser_download_url;
      } else {
        linux.textContent = "Linux: coming soon";
        linux.setAttribute("aria-disabled", "true");
      }
      const version = release.tag_name.replace(/^v/, "");
      document.getElementById("release-line").textContent =
        `Version ${version}. Free and open source. Updates itself on Windows.`;
    })
    .catch(() => {
      // keep the links to the releases page
    });
})();
