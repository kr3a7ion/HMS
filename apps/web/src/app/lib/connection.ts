// Connection state for an offline-first product.
//
// Doc 3 §2.4: "In an offline-first product 'the tablet lost wifi' is routine,
// not an error. One treatment, app-wide."
//
// WHY THIS IS NOT `navigator.onLine`: that flag reports whether the OS has a
// network interface up, which on a hotel LAN is almost always true and almost
// always irrelevant. The question that matters here is "can this browser
// reach the LOCAL SERVER" -- and a property whose switch is fine but whose
// local server has stopped is exactly the case staff hit. navigator.onLine
// says "online" throughout.
//
// So the source of truth is our own request layer: api.ts throws NetworkError
// when the fetch never reached the server. Every such throw reports here.
// navigator.onLine is used only as a fast NEGATIVE signal (interface down =>
// definitely offline), never as a positive one.

import { useSyncExternalStore } from "react";

export type ConnectionState = "online" | "offline";

let state: ConnectionState = "online";
let lastLossAt: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Called by the api layer when a request fails to reach the server. */
export function reportUnreachable() {
  if (state === "offline") return;
  state = "offline";
  lastLossAt = Date.now();
  emit();
}

/** Called by the api layer whenever any request succeeds. */
export function reportReachable() {
  if (state === "online") return;
  state = "online";
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // The interface going down is a reliable negative; coming back up is not a
  // reliable positive, so "online" only ever gets set by a real success.
  const onBrowserOffline = () => reportUnreachable();
  window.addEventListener("offline", onBrowserOffline);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("offline", onBrowserOffline);
  };
}

export function useConnection(): { state: ConnectionState; lastLossAt: number | null } {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => "online" as ConnectionState,
  );
  return { state: s, lastLossAt };
}

/** Non-reactive read, for imperative paths (e.g. deciding to queue a write). */
export function isOffline(): boolean {
  return state === "offline";
}
