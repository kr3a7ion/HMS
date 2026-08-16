// Backend Blueprint B0.5 — structured JSON logging replacing ad-hoc
// console.*. Every line carries the request ID (B0.4), the actor, the
// route, and the duration, so a property's logs can actually be queried
// rather than read.
//
// ROTATION. The blueprint asks for rotation. On the packaged deployment the
// container's stdout is captured and rotated by the host's logging driver
// (Docker's json-file driver with max-size/max-file, set in the compose
// file), which is the standard arrangement for a containerised service and
// avoids a second process writing to the same file as the app. When
// NEXURA_LOG_FILE is set -- the bare-metal install path, where nothing else
// is rotating for us -- we additionally write to that file via pino's
// transport, and the runbook pairs it with logrotate. Both paths are real;
// which one applies is a deployment choice, not a code choice.
import pino from "pino";

const level = process.env.NEXURA_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

// Field names that must never appear in a log line with their value intact.
// pino's redact applies to any depth via the wildcard paths below.
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers['x-branch-sync-key']",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.clientSecret",
  "*.accessToken",
  "*.refreshToken",
  "*.syncKey",
  "*.pin",
  "*.totpSecret",
  "password",
  "passwordHash",
  "clientSecret",
  "accessToken",
  "refreshToken",
  "syncKey",
  "pin",
  "totpSecret",
];

const fileTarget = process.env.NEXURA_LOG_FILE;

export const logger = pino({
  level,
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  base: { service: "nexura-local-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(fileTarget
    ? { transport: { targets: [
        { target: "pino/file", options: { destination: 1 } },
        { target: "pino/file", options: { destination: fileTarget, mkdir: true } },
      ] } }
    : {}),
});
