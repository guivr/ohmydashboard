"use client";

import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

interface IntegrationLogoProps {
  /** Integration ID (e.g. "stripe") or name (e.g. "Stripe") — matched case-insensitively */
  integration: string;
  className?: string;
  /** Size in px. Defaults to 16. */
  size?: number;
}

/**
 * Renders the real brand logo SVG for known integrations.
 * Falls back to a generic Lucide icon for unknown ones.
 *
 * When adding a new integration, add its logo SVG here.
 */
export function IntegrationLogo({
  integration,
  className,
  size = 16,
}: IntegrationLogoProps) {
  const key = integration.toLowerCase();

  const logo = LOGOS[key];
  if (logo) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        style={{ width: size, height: size }}
        aria-label={`${integration} logo`}
        role="img"
      >
        {logo(size)}
      </span>
    );
  }

  // Fallback
  return (
    <BarChart3
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
      aria-label={`${integration} icon`}
    />
  );
}

// ─── Logo registry ───────────────────────────────────────────────────────────
// Each entry is a function that takes size and returns an SVG element.
// Colors use "currentColor" where appropriate so they adapt to context,
// or the official brand color when it should stay fixed.

const LOGOS: Record<string, (size: number) => React.ReactNode> = {
  stripe: (size) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="4" fill="#635BFF" />
      <path
        d="M11.2 9.65c0-.68.56-1.02 1.47-1.02.98 0 2.22.3 3.2.83V6.52a8.44 8.44 0 0 0-3.2-.6c-2.62 0-4.36 1.37-4.36 3.66 0 3.57 4.9 3 4.9 4.54 0 .81-.7 1.07-1.68 1.07-1.45 0-2.63-.6-3.5-1.42v3.04a8.9 8.9 0 0 0 3.5.74c2.68 0 4.52-1.32 4.52-3.65-.01-3.85-4.85-3.17-4.85-4.25Z"
        fill="white"
      />
    </svg>
  ),

  gumroad: (size) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="4" fill="#FF90E8" />
      <path
        d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 6-6h-3a3 3 0 1 1-3-3V6Z"
        fill="#000"
      />
    </svg>
  ),

  revenuecat: (size) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="4" fill="#F25A5A" />
      <path
        d="M8 7.5c0-.28.22-.5.5-.5h3a4 4 0 0 1 0 8h-2v2.5a.5.5 0 0 1-1 0V15h-.5V7.5Zm1.5.5v5H12a3 3 0 0 0 0-6H9.5Z"
        fill="white"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  ),

  mixpanel: (size) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="4" fill="#7856FF" />
      <circle cx="8" cy="12" r="2.5" fill="white" />
      <circle cx="16" cy="12" r="2.5" fill="white" />
    </svg>
  ),

  appstoreconnect: (size) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="4" fill="#007AFF" />
      <path
        d="M12 6l5.5 9.5h-3L12 11l-2.5 4.5h-3L12 6Z"
        fill="white"
      />
      <path
        d="M6.5 17h4l-1-1.73H7.5L6.5 17Zm7 0h4l-1-1.73h-2L13.5 17Z"
        fill="white"
        opacity="0.7"
      />
    </svg>
  ),
};

/**
 * Returns the list of integration IDs that have real logos.
 * Useful for feature-gating or display logic.
 */
export function hasIntegrationLogo(integration: string): boolean {
  return integration.toLowerCase() in LOGOS;
}
