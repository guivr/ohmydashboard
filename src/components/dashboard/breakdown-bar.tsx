"use client";

import { cn } from "@/lib/utils";

interface BreakdownBarProps {
  percentage: number;
  minPercent?: number;
  containerClassName?: string;
  barClassName?: string;
}

export function BreakdownBar({
  percentage,
  minPercent = 0.5,
  containerClassName,
  barClassName,
}: BreakdownBarProps) {
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted/40",
        containerClassName
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          barClassName
        )}
        style={{
          width: `${Math.max(percentage, minPercent)}%`,
        }}
      />
    </div>
  );
}
