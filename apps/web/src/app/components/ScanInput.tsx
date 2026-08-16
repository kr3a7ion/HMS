// UI Adoption F8 — QR / NFC / barcode capture for T1 and T2.
//
// Doc 3 §2.3: "Zero free-text where a scan or picker works." A housekeeper
// working one-handed and gloved cannot type a room number, and asking them to
// is how the field app gets abandoned.
//
// WHAT THIS DOES AND DOES NOT DO. The states below (idle / scanning / waiting
// for NFC / success / error) are the ones the Figma blueprint specifies, and
// the manual-entry fallback is fully functional today. The CAMERA and NFC
// paths are deliberately capability-gated:
//
//   - BarcodeDetector is Chromium-only. On a browser without it, the camera
//     option is not offered -- not offered and broken, simply absent.
//   - Web NFC (NDEFReader) is Android Chrome only, and requires HTTPS.
//
// The real field app is planned as Flutter (Execution Plan 7.1), where both
// are native. This component is the browser's honest subset: it never shows a
// scan button that cannot scan. Where neither API exists, it degrades to the
// manual field, which is why that path is not treated as a second-class one.
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Keyboard, Nfc, X } from "lucide-react";
import { BORDER, ERROR, MUTED, PRIMARY, SUCCESS, TEXT, mono } from "../lib/tokens";
import { touchTarget, useTier } from "../lib/tier";

type ScanState = "idle" | "camera" | "nfc" | "success" | "error";

export interface ScanInputProps {
  /** Called with the scanned or typed code. */
  onScan: (code: string) => void;
  label?: string;
  placeholder?: string;
  /** e.g. "Room number" — used in the manual fallback's hint. */
  manualHint?: string;
}

// Capability probes, read once. `any` because neither API is in lib.dom yet.
const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
const hasNfc = typeof window !== "undefined" && "NDEFReader" in window;

export function ScanInput({
  onScan, label = "Scan to identify", placeholder = "Or type it in", manualHint,
}: ScanInputProps) {
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tier = useTier();

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stopCamera, []);

  const succeed = (code: string) => {
    stopCamera();
    setState("success");
    setMessage(code);
    onScan(code);
  };

  const fail = (msg: string) => {
    stopCamera();
    setState("error");
    setMessage(msg);
  };

  async function startCamera() {
    setState("camera");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code", "code_128", "ean_13"] });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found.length > 0 && found[0].rawValue) return succeed(found[0].rawValue);
        } catch { /* a dropped frame is not a failure; keep polling */ }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      fail("Couldn't open the camera. Check the permission, or type it in.");
    }
  }

  async function startNfc() {
    setState("nfc");
    setMessage("");
    try {
      const reader = new (window as any).NDEFReader();
      await reader.scan();
      reader.onreading = (e: any) => {
        const record = e.message?.records?.[0];
        const text = record
          ? new TextDecoder().decode(record.data)
          : String(e.serialNumber ?? "");
        if (text) succeed(text);
      };
      reader.onreadingerror = () => fail("Couldn't read that tag. Try again, or type it in.");
    } catch {
      fail("NFC isn't available on this device. Type it in instead.");
    }
  }

  const h = touchTarget(tier);

  return (
    <div className="space-y-2">
      <span className="block text-[12px]" style={{ color: MUTED }}>{label}</span>

      {state === "camera" && (
        <div className="relative overflow-hidden rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
          <video ref={videoRef} muted playsInline className="w-full" style={{ maxHeight: 240, objectFit: "cover" }} />
          <button
            onClick={() => { stopCamera(); setState("idle"); }}
            aria-label="Stop scanning"
            className="absolute right-2 top-2 rounded-full p-1.5"
            style={{ background: "rgba(15,23,42,0.6)", color: "#fff" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {state === "nfc" && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-4 text-[13px]"
          style={{ border: `1px dashed ${PRIMARY}`, color: PRIMARY }}
        >
          <Nfc size={18} className="animate-pulse" />
          Hold the device against the tag…
        </div>
      )}

      {state === "success" && (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: SUCCESS }}>
          <Check size={16} />
          <span style={{ fontFamily: mono }}>{message}</span>
        </div>
      )}

      {state === "error" && (
        <p role="alert" className="text-[12px]" style={{ color: ERROR }}>{message}</p>
      )}

      {(state === "idle" || state === "error") && (hasBarcodeDetector || hasNfc) && (
        <div className="flex gap-2">
          {hasBarcodeDetector && (
            <button
              onClick={startCamera}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md text-[13px]"
              style={{ border: `1px solid ${BORDER}`, color: PRIMARY, height: h }}
            >
              <Camera size={16} /> Scan code
            </button>
          )}
          {hasNfc && (
            <button
              onClick={startNfc}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md text-[13px]"
              style={{ border: `1px solid ${BORDER}`, color: PRIMARY, height: h }}
            >
              <Nfc size={16} /> Tap tag
            </button>
          )}
        </div>
      )}

      {/* Always available. On a browser with neither API this is the whole
          control, so it is styled as a first-class input, not a fallback. */}
      <form
        onSubmit={e => { e.preventDefault(); if (manual.trim()) succeed(manual.trim()); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Keyboard
            size={15}
            aria-hidden
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: MUTED }}
          />
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            placeholder={placeholder}
            aria-label={manualHint ?? placeholder}
            className="w-full rounded-md pl-8 pr-3 text-[14px]"
            style={{ border: `1px solid ${BORDER}`, height: h, color: TEXT, fontFamily: mono }}
          />
        </div>
        <button
          type="submit"
          disabled={!manual.trim()}
          className="rounded-md px-3 text-[13px] text-white"
          style={{ background: PRIMARY, height: h, opacity: manual.trim() ? 1 : 0.5 }}
        >
          Go
        </button>
      </form>
    </div>
  );
}
