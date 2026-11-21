import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import { BUILD_URL } from "../native/window";

/**
 * Whether a URL belongs to the app page. Compares protocol + host because
 * `URL.origin` is the string "null" for custom schemes like ferret-app://,
 * which would also match data: and other opaque URLs.
 */
export function isAppUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === BUILD_URL.protocol && parsed.host === BUILD_URL.host
    );
  } catch {
    return false;
  }
}

/**
 * Only the Ferret page itself may use Ferret's IPC; embeds in iframes must
 * never reach these handlers.
 */
export function isFromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return !!frame && frame === event.sender.mainFrame && isAppUrl(frame.url);
}
