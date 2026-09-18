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
