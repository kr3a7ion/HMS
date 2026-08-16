// Backend Blueprint B3. Inside a transaction callback there is no way to
// `return res.status(409).json(...)` -- returning normally would COMMIT the
// very work being rejected. The only way out that also rolls back is to
// throw, so a validation failure discovered mid-transaction needs to carry
// its HTTP status with it and be turned into a response outside.
//
// Without this, the tempting shape is to do all the checks before BEGIN and
// only write inside -- which is exactly the check-then-write race this
// batch exists to remove.
export class HandlerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "HandlerError";
  }
}

export function isHandlerError(err: unknown): err is HandlerError {
  return err instanceof HandlerError;
}
