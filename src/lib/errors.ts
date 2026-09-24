export class GuardBlockedError extends Error {
  readonly code: 'ZERO_OUT_WIPE' | 'ABNORMAL_DROP' | 'COLD_ZERO_OUT';
  readonly requiresConfirmation: boolean;

  constructor(
    message: string,
    code: 'ZERO_OUT_WIPE' | 'ABNORMAL_DROP' | 'COLD_ZERO_OUT',
    requiresConfirmation: boolean = false
  ) {
    super(message);
    this.name = 'GuardBlockedError';
    this.code = code;
    this.requiresConfirmation = requiresConfirmation;
    Object.setPrototypeOf(this, GuardBlockedError.prototype);
  }
}

export class PreFetchSyncError extends Error {
  readonly isRetryable: boolean = true;

  constructor(message: string, readonly originalError?: unknown) {
    super(message);
    this.name = 'PreFetchSyncError';
    Object.setPrototypeOf(this, PreFetchSyncError.prototype);
  }
}
