export class GuardBlockedError extends Error {
  readonly code: 'ZERO_OUT_WIPE' | 'ABNORMAL_DROP' | 'COLD_ZERO_OUT';

  constructor(message: string, code: 'ZERO_OUT_WIPE' | 'ABNORMAL_DROP' | 'COLD_ZERO_OUT') {
    super(message);
    this.name = 'GuardBlockedError';
    this.code = code;
    Object.setPrototypeOf(this, GuardBlockedError.prototype);
  }
}
