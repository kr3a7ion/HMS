// Backend Blueprint B0.4 — a correlation ID per request, attached to `req`,
// echoed in the response header, and included in every log line and error
// response. When a front-desk clerk reports "it failed at 14:32", the ID on
// their error toast is what turns that into a single grep.
import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

export const REQUEST_ID_HEADER = "x-request-id";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Honour an inbound ID so a chain of calls (web app → local server, or a
  // field device replaying a queued batch) keeps one ID end to end. Cap the
  // length and charset -- this value ends up in logs, and an unbounded
  // client-supplied string is a log-injection vector.
  const inbound = req.header(REQUEST_ID_HEADER);
  const valid = typeof inbound === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(inbound);
  req.requestId = valid ? inbound! : nanoid(12);
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}
