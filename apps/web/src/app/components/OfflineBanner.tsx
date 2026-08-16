// UI Adoption F2 — global connection state, one treatment app-wide.
//
// Doc 3 §2.4. Mounted once per shell, above the content.
//
// BE PRECISE ABOUT WHICH "OFFLINE" THIS IS. Nexura is offline-first in the
// sense that the LOCAL SERVER runs on the property and does not need the
// internet: when the uplink drops, the hotel keeps trading and only *sync to
// central* stops. That state is normal, it is not an error, and it is
// reported by the sync pill in the header -- not here.
//
// THIS banner is the other case: the browser cannot reach the local server
// itself. There is no client-side write queue, so nothing can be saved while
// this is showing. Telling staff their charges are being queued would be a
// lie of exactly the kind the quality gates exist to prevent -- a success
// message for something that did not happen. So the copy says what is true
// and what to do about it.
import { WifiOff } from "lucide-react";
import { useConnection } from "../lib/connection";
import { ERROR } from "../lib/tokens";

export function OfflineBanner() {
  const { state } = useConnection();
  if (state === "online") return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-2 px-4 py-2 text-[13px]"
      style={{ background: "#FEF2F2", color: "#7F1D1D", borderBottom: `1px solid ${ERROR}` }}
    >
      <WifiOff size={15} style={{ color: ERROR, flexShrink: 0 }} />
      <span>
        <strong style={{ fontWeight: 600 }}>Can't reach the property server.</strong>{" "}
        Nothing can be saved until it's back. Check that the server machine is
        on and this device is on the property network.
      </span>
    </div>
  );
}
