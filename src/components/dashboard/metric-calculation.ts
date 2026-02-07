export interface CalculationInfo {
  metricKey: string;
  isStock: boolean;
  from?: string;
  to?: string;
  prevFrom?: string;
  prevTo?: string;
  currentValue: number;
  previousValue?: number;
  compareEnabled: boolean;
  compareAvailable: boolean;
}

export function buildCalculationLines(info: CalculationInfo): string[] {
  const lines: string[] = [];

  if (info.isStock) {
    if (info.to) {
      lines.push(`Current = latest snapshot on or before ${info.to}.`);
    } else {
      lines.push("Current = latest available snapshot.");
    }
    if (info.compareEnabled) {
      if (info.prevTo) {
        lines.push(`Previous = latest snapshot on or before ${info.prevTo}.`);
      } else {
        lines.push("Previous = latest snapshot in prior range.");
      }
    }
  } else {
    if (info.from && info.to) {
      lines.push(`Current = sum of daily values from ${info.from} to ${info.to}.`);
    } else {
      lines.push("Current = sum of daily values in the selected range.");
    }
    if (info.compareEnabled && info.prevFrom && info.prevTo) {
      lines.push(
        `Previous = sum of daily values from ${info.prevFrom} to ${info.prevTo}.`
      );
    }
  }

  if (info.compareEnabled && !info.compareAvailable) {
    lines.push("Comparison hidden: insufficient historical coverage.");
  }

  return lines;
}
