export type PasskeyErrorCode =
  | 'canceled'
  | 'noCredentials'
  | 'alreadyRegistered'
  | 'domainNotAssociated'
  | 'unsupported'
  | 'invalidOptions'
  | 'unknown';

const CODES: ReadonlySet<string> = new Set<PasskeyErrorCode>([
  'canceled',
  'noCredentials',
  'alreadyRegistered',
  'domainNotAssociated',
  'unsupported',
  'invalidOptions',
  'unknown',
]);

const TOKEN_RE = /\[Passkeys:([A-Za-z0-9-]+)\]\s?/;
const ASAUTH_RE = /^asauth-\d+$/;

function codeForToken(token: string | undefined): PasskeyErrorCode {
  if (token === undefined) return 'unknown';
  if (token === 'asauth-1001') return 'canceled';
  if (token === 'asauth-1006') return 'alreadyRegistered';
  if (ASAUTH_RE.test(token)) return 'unknown';
  return CODES.has(token) ? (token as PasskeyErrorCode) : 'unknown';
}

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;

  constructor(code: PasskeyErrorCode, message: string) {
    super(message);
    this.name = 'PasskeyError';
    this.code = code;
  }

  /** Normalises any thrown value into a `PasskeyError`. Never throws. */
  static from(error: unknown): PasskeyError {
    try {
      if (error instanceof PasskeyError) return error;
      const original =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      const match = TOKEN_RE.exec(original);
      const code = codeForToken(match?.[1]);
      const stripped = match ? original.replace(TOKEN_RE, '') : original;
      return new PasskeyError(code, stripped.length > 0 ? stripped : original);
    } catch {
      return new PasskeyError('unknown', 'Unknown error');
    }
  }
}
