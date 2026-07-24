// IT-02 System Health "View error logs". In-memory only -- restarting the
// server clears it, and Express 4 doesn't auto-catch rejected promises from
// async route handlers (nothing here retrofits every route with a wrapper),
// so this captures synchronous throws and explicit next(err) calls, not
// every possible failure. Real, just partial -- see ROADMAP.md.
export interface CapturedError {
  id: string; timestamp: string; method: string; path: string; message: string; stack?: string;
}

const MAX_ENTRIES = 100;
const buffer: CapturedError[] = [];
let counter = 0;

export function captureError(method: string, path: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  buffer.unshift({ id: String(++counter), timestamp: new Date().toISOString(), method, path, message, stack });
  if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES;
}

export function getErrorLog(): CapturedError[] {
  return buffer;
}
