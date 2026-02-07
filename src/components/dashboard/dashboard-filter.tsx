"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  Minus,
} from "lucide-react";
import { IntegrationLogo } from "@/components/integration-logo";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AccountInfo {
  id: string;
  label: string;
  isActive: boolean;
}

interface IntegrationInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  accounts: AccountInfo[];
}

interface DashboardFilterProps {
  integrations: IntegrationInfo[];
  /** Set of currently enabled account IDs */
  enabledAccountIds: Set<string>;
  /** Called when the enabled set changes */
  onFilterChange: (accountIds: Set<string>) => void;
}



// ─── Component ──────────────────────────────────────────────────────────────

export function DashboardFilter({
  integrations,
  enabledAccountIds,
  onFilterChange,
}: DashboardFilterProps) {
  const [openIntegration, setOpenIntegration] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Only show integrations that have connected accounts
  const connected = integrations.filter((i) => i.accounts.length > 0);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenIntegration(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (connected.length === 0) return null;

  const enableAll = (integration: IntegrationInfo) => {
    const next = new Set(enabledAccountIds);
    integration.accounts.forEach((a) => next.add(a.id));
    onFilterChange(next);
  };

  const disableAll = (integration: IntegrationInfo) => {
    const next = new Set(enabledAccountIds);
    integration.accounts.forEach((a) => next.delete(a.id));
    onFilterChange(next);
  };

  const toggleAccount = (accountId: string) => {
    const next = new Set(enabledAccountIds);
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    onFilterChange(next);
  };

  return (
    <div className="flex flex-wrap items-start gap-2" ref={dropdownRef}>
      <span className="self-center text-xs font-medium text-muted-foreground">
        Data from:
      </span>

      {connected.map((integration) => {
        const accountIds = integration.accounts.map((a) => a.id);
        const enabledCount = accountIds.filter((id) =>
          enabledAccountIds.has(id)
        ).length;
        const allEnabled = enabledCount === accountIds.length;
        const noneEnabled = enabledCount === 0;
        const someEnabled = enabledCount > 0 && !allEnabled;
        const isOpen = openIntegration === integration.id;
        const accountCount = integration.accounts.length;

        return (
          <div key={integration.id} className="relative">
            {/* Integration pill — always opens dropdown on click */}
            <button
              type="button"
              onClick={() =>
                setOpenIntegration(isOpen ? null : integration.id)
              }
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                allEnabled
                  ? "border-transparent text-white"
                  : someEnabled
                    ? "border-transparent text-white opacity-80"
                    : "border-border text-muted-foreground hover:border-muted-foreground/30"
              )}
              style={
                enabledCount > 0
                  ? { backgroundColor: integration.color }
                  : undefined
              }
            >
              <IntegrationLogo integration={integration.name} size={16} />
              <span>
                {integration.name}
                <span className={cn("ml-1", enabledCount > 0 ? "opacity-70" : "opacity-50")}>
                  ({someEnabled ? `${enabledCount}/` : ""}{accountCount}{" "}
                  {accountCount === 1 ? "account" : "accounts"})
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {/* Dropdown */}
            {isOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 min-w-52 rounded-lg border border-border bg-card p-1 shadow-lg">
                {/* Toggle all */}
                <button
                  type="button"
                  onClick={() =>
                    allEnabled
                      ? disableAll(integration)
                      : enableAll(integration)
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      allEnabled
                        ? "border-transparent text-white"
                        : someEnabled
                          ? "border-transparent text-white"
                          : "border-border"
                    )}
                    style={
                      enabledCount > 0
                        ? { backgroundColor: integration.color }
                        : undefined
                    }
                  >
                    {allEnabled && <Check className="h-3 w-3" />}
                    {someEnabled && <Minus className="h-3 w-3" />}
                  </span>
                  {allEnabled ? "Deselect all" : "Select all"}
                </button>

                <div className="my-1 h-px bg-border" />

                {/* Individual accounts */}
                {integration.accounts.map((account) => {
                  const isEnabled = enabledAccountIds.has(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isEnabled
                            ? "border-transparent text-white"
                            : "border-border"
                        )}
                        style={
                          isEnabled
                            ? { backgroundColor: integration.color }
                            : undefined
                        }
                      >
                        {isEnabled && <Check className="h-3 w-3" />}
                      </span>
                      <span
                        className={cn(
                          "truncate",
                          isEnabled
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {account.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
