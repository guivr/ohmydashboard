/**
 * Shared country code utilities.
 *
 * All country data stored in the database uses ISO 3166-1 alpha-2 codes
 * (e.g. "US", "DE", "BR"). This module provides:
 *
 * - `resolveCountryCode(name)` — convert a display name like "United States"
 *   to its alpha-2 code. Works with all major name variants across APIs.
 * - `getCountryName(code)` — convert an alpha-2 code to its English name.
 * - `isValidCountryCode(code)` — check if a string is a valid alpha-2 code.
 *
 * Backed by `i18n-iso-countries` (comprehensive ISO 3166-1 database) with a
 * small set of manual overrides for names that external APIs (RevenueCat, etc.)
 * use but the library doesn't recognize.
 */

import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

// Register English locale — the only one we need for name resolution
countries.registerLocale(enLocale);

// ─── Name → Code overrides ─────────────────────────────────────────────────
//
// These cover name variants used by external APIs (primarily RevenueCat v3)
// that `i18n-iso-countries` doesn't map. The library handles most standard
// names, but some APIs return formal UN-style names, obsolete forms, or
// non-standard abbreviations.
//
// Keys MUST be lowercase. Values are ISO 3166-1 alpha-2 codes.

const NAME_OVERRIDES: Record<string, string> = {
  // UN formal names that the library doesn't reverse-map
  "viet nam": "VN",
  "iran, islamic republic of": "IR",
  "congo, the democratic republic of the": "CD",
  "bolivia, plurinational state of": "BO",
  "venezuela, bolivarian republic of": "VE",
  "tanzania, united republic of": "TZ",
  "palestine, state of": "PS",
  "korea, republic of": "KR",
  "russian federation": "RU",
  "palestinian territory, occupied": "PS",
  "lao people's democratic republic": "LA",
  "micronesia, federated states of": "FM",
  "congo, republic of the": "CG",
  "virgin islands, british": "VG",
  "virgin islands, u.s.": "VI",
  "saint martin (french part)": "MF",
  "sint maarten (dutch part)": "SX",

  // Common short names the library might miss
  "south korea": "KR",
  "north korea": "KP",
  "ivory coast": "CI",
  "east timor": "TL",
  "cape verde": "CV",
  "the bahamas": "BS",
  "the gambia": "GM",

  // Sentinel value used by some APIs for unknown/unresolved countries
  "unknown": "Unknown",
};

/**
 * Resolve a country display name to its ISO 3166-1 alpha-2 code.
 *
 * Handles:
 * - Standard English names ("United States" → "US")
 * - Formal UN names ("Iran, Islamic Republic of" → "IR")
 * - Common short names ("South Korea" → "KR")
 * - Already-valid alpha-2 codes passed through ("US" → "US")
 *
 * Returns the raw input if no mapping is found (so the caller can decide
 * how to handle unknown names).
 */
export function resolveCountryCode(name: string): string {
  if (!name) return "Unknown";

  const trimmed = name.trim();

  // Fast path: if it's already a valid 2-letter ISO code, return it uppercased
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (countries.isValid(upper) || upper === "XK") {
      return upper;
    }
  }

  // Check manual overrides first (they take priority for edge cases)
  const overrideCode = NAME_OVERRIDES[trimmed.toLowerCase()];
  if (overrideCode) return overrideCode;

  // Use the library's name → alpha2 lookup
  const libraryCode = countries.getAlpha2Code(trimmed, "en");
  if (libraryCode) return libraryCode;

  // Fallback: strip diacritics and retry.
  // Handles accented names like "Réunion" → "Reunion", "Côte d'Ivoire", etc.
  const stripped = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (stripped !== trimmed) {
    const strippedCode = countries.getAlpha2Code(stripped, "en");
    if (strippedCode) return strippedCode;
  }

  // Last resort: return the input as-is
  return trimmed;
}

/**
 * Get the English display name for an ISO 3166-1 alpha-2 country code.
 *
 * Returns the code itself if no name is found (e.g. "Unknown", "Other",
 * or invalid codes).
 */
export function getCountryName(code: string): string {
  if (!code || code === "Unknown" || code === "Other") return code;
  return countries.getName(code, "en") ?? code;
}

/**
 * Check whether a string is a valid ISO 3166-1 alpha-2 country code.
 * Also accepts "XK" (Kosovo, widely used but not in the official standard).
 */
export function isValidCountryCode(code: string): boolean {
  if (!code || code.length !== 2) return false;
  const upper = code.toUpperCase();
  return countries.isValid(upper) || upper === "XK";
}
