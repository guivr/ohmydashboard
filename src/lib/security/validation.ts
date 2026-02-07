/**
 * Input validation utilities.
 *
 * Keeps validation rules centralized and consistent across all API routes.
 */

const MAX_LABEL_LENGTH = 200;
const MAX_STRING_LENGTH = 1000;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a label string (account name, etc.)
 */
export function validateLabel(value: unknown): ValidationError | null {
  if (typeof value !== "string") {
    return { field: "label", message: "Label must be a string" };
  }
  if (value.trim().length === 0) {
    return { field: "label", message: "Label cannot be empty" };
  }
  if (value.length > MAX_LABEL_LENGTH) {
    return {
      field: "label",
      message: `Label must be at most ${MAX_LABEL_LENGTH} characters`,
    };
  }
  return null;
}

/**
 * Validate an integration ID.
 */
export function validateIntegrationId(value: unknown): ValidationError | null {
  if (typeof value !== "string") {
    return { field: "integrationId", message: "Integration ID must be a string" };
  }
  if (value.length === 0 || value.length > 100) {
    return { field: "integrationId", message: "Invalid integration ID length" };
  }
  if (!ID_PATTERN.test(value)) {
    return {
      field: "integrationId",
      message: "Integration ID contains invalid characters",
    };
  }
  return null;
}

/**
 * Validate credentials object.
 * Must be a non-null object with string keys and string values.
 */
export function validateCredentials(
  value: unknown
): ValidationError | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return { field: "credentials", message: "Credentials must be an object" };
  }
  const obj = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (typeof key !== "string" || key.length > MAX_STRING_LENGTH) {
      return {
        field: "credentials",
        message: `Invalid credential key: ${key.slice(0, 50)}`,
      };
    }
    if (typeof val !== "string") {
      return {
        field: "credentials",
        message: `Credential "${key}" must be a string value`,
      };
    }
    if (val.length > MAX_STRING_LENGTH) {
      return {
        field: "credentials",
        message: `Credential "${key}" value exceeds maximum length`,
      };
    }
  }
  return null;
}

/**
 * Validate a boolean value.
 */
export function validateBoolean(
  field: string,
  value: unknown
): ValidationError | null {
  if (typeof value !== "boolean") {
    return { field, message: `${field} must be a boolean` };
  }
  return null;
}

/**
 * Validate a date string in YYYY-MM-DD format.
 */
export function validateDateString(
  field: string,
  value: unknown
): ValidationError | null {
  if (typeof value !== "string") {
    return { field, message: `${field} must be a string` };
  }
  if (!DATE_PATTERN.test(value)) {
    return { field, message: `${field} must be in YYYY-MM-DD format` };
  }
  // Verify it's actually a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { field, message: `${field} is not a valid date` };
  }
  return null;
}

/**
 * Validate an account ID string.
 */
export function validateAccountId(value: unknown): ValidationError | null {
  if (typeof value !== "string") {
    return { field: "accountId", message: "Account ID must be a string" };
  }
  if (value.length === 0 || value.length > 200) {
    return { field: "accountId", message: "Invalid account ID length" };
  }
  return null;
}
