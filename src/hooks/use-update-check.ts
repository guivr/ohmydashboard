"use client";

import { useEffect, useState } from "react";
import packageJson from "../../package.json";

interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

const CURRENT_VERSION = packageJson.version as string;
const STORAGE_KEY = `omd-update-check:${CURRENT_VERSION}`;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Checks for a newer version of OhMyDashboard on mount.
 * Caches the result in sessionStorage so the npm registry is only hit once per session / hour.
 * Cache is versioned to avoid stale update banners after upgrading.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as UpdateInfo & { ts: number };
        if (
          parsed.current === CURRENT_VERSION &&
          Date.now() - parsed.ts < CACHE_DURATION_MS
        ) {
          setUpdate(parsed);
          return;
        }
      }
    } catch {
      // ignore parse errors
    }

    let cancelled = false;

    fetch("/api/version")
      .then((res) => res.json())
      .then((data: UpdateInfo) => {
        if (cancelled) return;
        setUpdate(data);
        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...data, ts: Date.now() })
          );
        } catch {
          // sessionStorage may be unavailable
        }
      })
      .catch(() => {
        // silently ignore — update check is non-critical
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return update;
}
