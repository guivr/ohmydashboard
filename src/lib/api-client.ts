/**
 * Shared API client with CSRF protection header included automatically.
 *
 * All client-side fetch calls to our API routes should use this
 * instead of raw `fetch()` to ensure CSRF headers are always sent.
 */

const CSRF_HEADERS = {
  "x-omd-request": "1",
};

/**
 * Make a GET request to a local API endpoint.
 */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: CSRF_HEADERS,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Make a POST request to a local API endpoint.
 */
export async function apiPost<T = unknown>(
  url: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...CSRF_HEADERS,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Make a PATCH request to a local API endpoint.
 */
export async function apiPatch<T = unknown>(
  url: string,
  body: unknown
): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...CSRF_HEADERS,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Make a DELETE request to a local API endpoint.
 */
export async function apiDelete<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: CSRF_HEADERS,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return response.json();
}
