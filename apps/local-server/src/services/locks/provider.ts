// Lock Provider Interface (Blueprint Part 6.1). The rest of the app --
// routes/doorLock.ts, the queue processor, check-in/check-out -- only ever
// talks to this interface, never to a specific vendor's API directly.
// Adding a second provider (e.g. ZKTeco) later means writing a new adapter
// that implements this same interface; no caller code changes.
export interface ActivateCardParams {
  lockId: string; cardNumber: string; cardName: string; validFrom: Date; validTo: Date;
}
export interface ActivateCardResult { ttlockCardId: string }

export interface GeneratePinParams {
  lockId: string; pin: string; pinName: string; validFrom: Date; validTo: Date;
}
export interface GeneratePinResult { ttlockKeyboardPwdId: string }

export interface RevokeParams {
  lockId: string; credentialType: "card" | "pin"; ttlockCardId?: string; ttlockKeyboardPwdId?: string;
}

export interface LockSummary { lockId: string; lockName: string }
export interface TestConnectionResult { ok: boolean; lockCount?: number; error?: string }

// Every method throws LockProviderError on failure (auth, network, or
// vendor-API error) -- callers (routes/doorLock.ts) decide whether that
// means "queue for retry" or "surface to the user", not this layer.
export class LockProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "LockProviderError";
  }
}

export interface LockProvider {
  activateCardAccess(params: ActivateCardParams): Promise<ActivateCardResult>;
  generatePIN(params: GeneratePinParams): Promise<GeneratePinResult>;
  revokeAccess(params: RevokeParams): Promise<void>;
  listLocks(): Promise<LockSummary[]>;
  testConnection(): Promise<TestConnectionResult>;
}
