import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

const NPM_REGISTRY_URL = "https://registry.npmjs.org/ohmydashboard/latest";

/**
 * GET /api/version
 * Compares the local app version against the latest published npm version.
 * Returns { current, latest, updateAvailable }.
 */
export async function GET() {
  const current = packageJson.version;

  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, updateAvailable: false });
    }

    const data = await res.json();
    const latest = data.version as string;

    return NextResponse.json({
      current,
      latest,
      updateAvailable: latest !== current && isNewer(latest, current),
    });
  } catch {
    return NextResponse.json({ current, latest: null, updateAvailable: false });
  }
}

/** Simple semver comparison: returns true if a > b */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}
