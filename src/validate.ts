const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

function unpaddedLength(value: string): number {
  let end = value.length;
  while (end > 0 && value[end - 1] === '=') end--;
  return end;
}

/**
 * True for a non-empty base64url string with optional `=` padding. Rejects `+`, `/`, whitespace,
 * impossible lengths (unpadded length % 4 === 1) and padding that does not complete a 4-char group.
 */
export function isBase64URL(value: unknown): value is string {
  if (typeof value !== 'string' || !BASE64URL_RE.test(value)) return false;
  const unpadded = unpaddedLength(value);
  if (unpadded === 0 || unpadded % 4 === 1) return false;
  if (unpadded !== value.length && value.length % 4 !== 0) return false;
  return true;
}

/** Number of bytes a valid base64url string decodes to. */
export function base64URLByteLength(value: string): number {
  return Math.floor((unpaddedLength(value) * 3) / 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateDescriptors(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return `${field} must be an array`;
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry) || !isBase64URL(entry['id'])) {
      return `${field}[${index}].id is not valid base64url`;
    }
  }
  return undefined;
}

/** Returns a reason for the first failing rule, or `undefined` when the options are valid. */
export function validateCreationOptions(options: unknown): string | undefined {
  if (!isRecord(options)) return 'options must be an object';
  const { rp, user, challenge, excludeCredentials, pubKeyCredParams } = options;
  if (!isRecord(rp)) return 'rp must be an object';
  if (!isNonEmptyString(rp['id'])) return 'rp.id is required';
  if (!isNonEmptyString(challenge)) return 'challenge is required';
  if (!isBase64URL(challenge)) return 'challenge is not valid base64url';
  if (!isRecord(user)) return 'user must be an object';
  if (!isNonEmptyString(user['id'])) return 'user.id is required';
  if (!isNonEmptyString(user['name'])) return 'user.name is required';
  if (!isBase64URL(user['id'])) return 'user.id is not valid base64url';
  const userIdBytes = base64URLByteLength(user['id']);
  if (userIdBytes < 1 || userIdBytes > 64)
    return 'user.id must decode to 1-64 bytes';
  const excludeReason = validateDescriptors(
    excludeCredentials,
    'excludeCredentials',
  );
  if (excludeReason) return excludeReason;
  if (pubKeyCredParams !== undefined) {
    if (!Array.isArray(pubKeyCredParams))
      return 'pubKeyCredParams must be an array';
    if (
      pubKeyCredParams.length > 0 &&
      !pubKeyCredParams.some((param) => isRecord(param) && param['alg'] === -7)
    ) {
      return 'pubKeyCredParams must include ES256 (alg -7)';
    }
  }
  return undefined;
}

/** Returns a reason for the first failing rule, or `undefined` when the options are valid. */
export function validateRequestOptions(options: unknown): string | undefined {
  if (!isRecord(options)) return 'options must be an object';
  if (!isNonEmptyString(options['rpId'])) return 'rpId is required';
  if (!isNonEmptyString(options['challenge'])) return 'challenge is required';
  if (!isBase64URL(options['challenge']))
    return 'challenge is not valid base64url';
  return validateDescriptors(options['allowCredentials'], 'allowCredentials');
}

function validateCommonResponse(value: unknown): string | undefined {
  if (!isRecord(value)) return 'response must be an object';
  if (!isNonEmptyString(value['id'])) return 'id is missing';
  if (!isNonEmptyString(value['rawId'])) return 'rawId is missing';
  if (value['id'] !== value['rawId']) return 'id does not equal rawId';
  if (value['type'] !== 'public-key') return "type must be 'public-key'";
  if (!isRecord(value['response'])) return 'response.response is missing';
  return undefined;
}

function missingFields(
  response: Record<string, unknown>,
  fields: string[],
): string | undefined {
  for (const field of fields) {
    if (!isNonEmptyString(response[field]))
      return `response.${field} is missing`;
  }
  return undefined;
}

export function validateRegistrationResponse(
  value: unknown,
): string | undefined {
  const common = validateCommonResponse(value);
  if (common) return common;
  const response = (value as { response: Record<string, unknown> }).response;
  return missingFields(response, ['clientDataJSON', 'attestationObject']);
}

export function validateAuthenticationResponse(
  value: unknown,
): string | undefined {
  const common = validateCommonResponse(value);
  if (common) return common;
  const response = (value as { response: Record<string, unknown> }).response;
  return missingFields(response, [
    'clientDataJSON',
    'authenticatorData',
    'signature',
  ]);
}
