"use client";

import { useEffect, useMemo, useState } from "react";
import {
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/hooks/use-dashboard-data";
import type { DateRange } from "react-day-picker";

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_4_weeks: "Last 4 weeks",
  last_30_days: "Last 30 days",
  month_to_date: "Month to date",
  quarter_to_date: "Quarter to date",
  year_to_date: "Year to date",
  all_time: "All time",
  custom: "Custom range",
};

interface DateRangeFilterProps {
  value: DateRangePreset;
  rangeFrom?: string;
  rangeTo?: string;
  compareEnabled: boolean;
  onChange: (preset: DateRangePreset) => void;
  onCustomRangeChange: (range: { from: Date; to: Date }) => void;
  onCompareToggle: (enabled: boolean) => void;
}

function resolvePresetRange(preset: DateRangePreset): DateRange | undefined {
  const now = new Date();
  const end = endOfDay(now);

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: end };
    case "last_7_days":
      return { from: subDays(startOfDay(now), 6), to: end };
    case "last_4_weeks":
      return { from: subDays(startOfDay(now), 27), to: end };
    case "last_30_days":
      return { from: subDays(startOfDay(now), 29), to: end };
    case "month_to_date":
      return { from: startOfMonth(now), to: end };
    case "quarter_to_date":
      return { from: startOfQuarter(now), to: end };
    case "year_to_date":
      return { from: startOfYear(now), to: end };
    case "all_time":
    case "custom":
    default:
      return undefined;
  }
}

function parseIsoDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatInputDate(value?: Date) {
  return value ? format(value, "MM / dd / yyyy") : "-- / -- / ----";
}

export function DateRangeFilter({
  value,
  rangeFrom,
  rangeTo,
  compareEnabled,
  onChange,
  onCustomRangeChange,
  onCompareToggle,
}: DateRangeFilterProps) {
  const compareDisabled = value === "all_time";
  const [open, setOpen] = useState(false);

  const currentRange = useMemo<DateRange | undefined>(() => {
    const from = parseIsoDate(rangeFrom);
    const to = parseIsoDate(rangeTo);
    if (!from && !to) return undefined;
    return { from, to };
  }, [rangeFrom, rangeTo]);

  const [draftRange, setDraftRange] = useState<DateRange | undefined>(currentRange);
  const [draftPreset, setDraftPreset] = useState<DateRangePreset>(value);
  const draftCompareDisabled = draftPreset === "all_time";

  useEffect(() => {
    if (!open) return;
    const nextRange = value === "custom" ? currentRange : resolvePresetRange(value);
    setDraftPreset(value);
    setDraftRange(nextRange);
  }, [open, value, currentRange]);

  const buttonLabel = useMemo(() => {
    if (value === "custom" && currentRange?.from && currentRange?.to) {
      return `${format(currentRange.from, "MMM d, yyyy")} – ${format(
        currentRange.to,
        "MMM d, yyyy"
      )}`;
    }
    return PRESET_LABELS[value];
  }, [value, currentRange]);

  const applySelection = () => {
    if (draftPreset === "custom") {
      if (draftRange?.from && draftRange?.to) {
        onCustomRangeChange({ from: draftRange.from, to: draftRange.to });
        setOpen(false);
      }
      return;
    }
    onChange(draftPreset);
    setOpen(false);
  };

  const clearSelection = () => {
    setDraftPreset("all_time");
    setDraftRange(undefined);
    onChange("all_time");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-8 gap-2 rounded-lg border-border/70 bg-card px-3 text-xs font-medium"
        >
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{buttonLabel}</span>
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[760px] p-4">
        <div className="flex items-start gap-5">
          <div className="w-44 space-y-1">
            {Object.entries(PRESET_LABELS)
              .filter(([key]) => key !== "custom")
              .map(([key, text]) => {
                const preset = key as DateRangePreset;
                const isActive = draftPreset === preset;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-muted/70"
                    )}
                    onClick={() => {
                      setDraftPreset(preset);
                      setDraftRange(resolvePresetRange(preset));
                    }}
                  >
                    {text}
                  </button>
                );
              })}
          </div>

          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Start
                <Input
                  readOnly
                  value={formatInputDate(draftRange?.from)}
                  className="h-9 text-sm font-medium text-foreground"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                End
                <Input
                  readOnly
                  value={formatInputDate(draftRange?.to)}
                  className="h-9 text-sm font-medium text-foreground"
                />
              </label>
            </div>

            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={draftRange?.from}
              selected={draftRange}
              onSelect={(range) => {
                setDraftRange(range);
                setDraftPreset("custom");
              }}
              className="rounded-md border"
            />

            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  id="compare-toggle"
                  type="checkbox"
                  checked={compareEnabled && !draftCompareDisabled}
                  disabled={draftCompareDisabled}
                  onChange={(event) => onCompareToggle(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-primary"
                />
                <label htmlFor="compare-toggle">Compare to previous period</label>
                {draftCompareDisabled && (
                  <span className="text-[11px] text-muted-foreground">
                    (Disabled for all time)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
                <Button size="sm" onClick={applySelection}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
