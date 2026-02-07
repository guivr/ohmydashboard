"use client";

import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/hooks/use-dashboard-data";

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_4_weeks: "Last 4 weeks",
  last_30_days: "Last 30 days",
  month_to_date: "Month to date",
  quarter_to_date: "Quarter to date",
  year_to_date: "Year to date",
  all_time: "All time",
};

interface DateRangeFilterProps {
  value: DateRangePreset;
  compareEnabled: boolean;
  onChange: (preset: DateRangePreset) => void;
  onCompareToggle: (enabled: boolean) => void;
}

export function DateRangeFilter({
  value,
  compareEnabled,
  onChange,
  onCompareToggle,
}: DateRangeFilterProps) {
  const label = PRESET_LABELS[value];
  const compareDisabled = value === "all_time";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-8 gap-2 rounded-lg border-border/70 bg-card px-3 text-xs font-medium"
        >
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{label}</span>
          <span
            className={cn(
              "ml-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
              compareEnabled && !compareDisabled
                ? "border-primary/30 text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            {compareEnabled && !compareDisabled ? "Compare" : "No compare"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground/80">
          Date range
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as DateRangePreset)}
        >
          {Object.entries(PRESET_LABELS).map(([key, text]) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {text}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={compareEnabled && !compareDisabled}
          onCheckedChange={(checked) => onCompareToggle(Boolean(checked))}
          disabled={compareDisabled}
        >
          Compare to previous period
        </DropdownMenuCheckboxItem>
        {compareDisabled && (
          <div className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">
            Compare is disabled for all time.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
