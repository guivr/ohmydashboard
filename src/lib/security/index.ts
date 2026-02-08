export { validateCsrf, CSRF_HEADER } from "./csrf";
export {
  validateLabel,
  validateIntegrationId,
  validateCredentials,
  validateBoolean,
  validateDateString,
  validateAccountId,
  type ValidationError,
} from "./validation";

import crypto from "crypto";

/**
 * Generate a cryptographically secure unique ID.
 * Uses crypto.randomUUID() which produces standard v4 UUIDs.
 */
export function generateSecureId(): string {
  return crypto.randomUUID();
}

/**
 * Sanitize an error message before storing it.
 *
 * Strips potential secrets from error messages:
 * - API keys (sk_live_*, sk_test_*, rk_live_*, rk_test_*, whsec_*)
 * - Bearer tokens
 * - Long hex strings that might be keys
 *
 * Truncates to a reasonable length.
 */
const SECRET_PATTERNS = [
  // Stripe secret keys
  /\b(sk_(?:live|test)_[a-zA-Z0-9]{10,})\b/g,
  // Stripe restricted keys
  /\b(rk_(?:live|test)_[a-zA-Z0-9]{10,})\b/g,
  // Stripe webhook secrets
  /\b(whsec_[a-zA-Z0-9]{10,})\b/g,
  // Generic API keys (long alphanumeric strings after common key-like prefixes)
  /\b((?:api|key|token|secret|password|auth)[_-]?[a-zA-Z0-9]{20,})\b/gi,
  // Bearer tokens (including base64 chars +, /, =)
  /Bearer\s+[a-zA-Z0-9._\-+/=]+/gi,
  // Long hex strings (potential keys, 32+ chars)
  /\b[0-9a-f]{32,}\b/gi,
];

const MAX_ERROR_LENGTH = 500;

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  if (sanitized.length > MAX_ERROR_LENGTH) {
    sanitized = sanitized.slice(0, MAX_ERROR_LENGTH) + "... (truncated)";
  }

  return sanitized;
}
