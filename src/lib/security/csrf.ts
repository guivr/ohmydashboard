import { NextResponse } from "next/server";

/**
 * CSRF protection for local API routes.
 *
 * Since OhMyDashboard runs locally, any website the user visits in their
 * browser can potentially make requests to localhost:3000. This middleware
 * protects against that by checking the Origin/Referer header.
 *
 * For state-changing requests (POST, PATCH, DELETE), we require:
 * 1. The request comes from the same origin (Origin or Referer header matches), OR
 * 2. The request includes our custom header (X-OMD-Request: 1), which browsers
 *    won't send cross-origin without a CORS preflight we don't allow.
 */

const CUSTOM_HEADER = "x-omd-request";
const CUSTOM_HEADER_VALUE = "1";

/**
 * Validate that a request is not a CSRF attack.
 * Returns null if valid, or a NextResponse error if invalid.
 */
export function validateCsrf(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  // Check custom header first (simplest and strongest protection)
  if (request.headers.get(CUSTOM_HEADER) === CUSTOM_HEADER_VALUE) {
    return null;
  }

  // Check Origin header
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1"
      ) {
        return null;
      }
    } catch {
      // Invalid origin URL, reject
    }

    return NextResponse.json(
      { error: "Forbidden: cross-origin request blocked" },
      { status: 403 }
    );
  }

  // Check Referer as fallback
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (
        refererUrl.hostname === "localhost" ||
        refererUrl.hostname === "127.0.0.1"
      ) {
        return null;
      }
    } catch {
      // Invalid referer URL, reject
    }

    return NextResponse.json(
      { error: "Forbidden: cross-origin request blocked" },
      { status: 403 }
    );
  }

  // No Origin or Referer header at all — this can happen with:
  // - Server-to-server requests (fine for local use)
  // - Some browser privacy settings that strip headers
  // - Direct API tools like curl
  // We allow these since this is a local app and the custom header
  // provides the primary protection
  return null;
}

/**
 * Get the custom CSRF header name and value.
 * The client should include this in all state-changing requests.
 */
export const CSRF_HEADER = {
  name: CUSTOM_HEADER,
  value: CUSTOM_HEADER_VALUE,
} as const;
