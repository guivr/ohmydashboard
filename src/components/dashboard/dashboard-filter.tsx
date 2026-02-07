"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
} from "lucide-react";
import { IntegrationLogo } from "@/components/integration-logo";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductInfo {
  id: string;
  label: string;
}

interface AccountInfo {
  id: string;
  label: string;
  isActive: boolean;
  products?: ProductInfo[];
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
  /** Set of currently enabled project/product IDs */
  enabledProjectIds: Set<string>;
  /** Called when the enabled sets change */
  onFilterChange: (accountIds: Set<string>, projectIds: Set<string>) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DashboardFilter({
  integrations,
  enabledAccountIds,
  enabledProjectIds,
  onFilterChange,
}: DashboardFilterProps) {
  const isLightColor = (hex?: string) => {
    if (!hex) return false;
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return false;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.6;
  };
  const [openIntegration, setOpenIntegration] = useState<string | null>(null);
  // Start with all accounts that have products expanded so products are visible
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => {
    const withProducts = new Set<string>();
    for (const integration of integrations) {
      for (const account of integration.accounts) {
        if (account.products && account.products.length > 0) {
          withProducts.add(account.id);
        }
      }
    }
    return withProducts;
  });
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

  // ─── Account toggle helpers ──────────────────────────────────────────────

  const enableAllAccounts = (integration: IntegrationInfo) => {
    const nextAccounts = new Set(enabledAccountIds);
    const nextProjects = new Set(enabledProjectIds);
    for (const a of integration.accounts) {
      nextAccounts.add(a.id);
      for (const p of a.products ?? []) {
        nextProjects.add(p.id);
      }
    }
    onFilterChange(nextAccounts, nextProjects);
  };

  const disableAllAccounts = (integration: IntegrationInfo) => {
    const nextAccounts = new Set(enabledAccountIds);
    const nextProjects = new Set(enabledProjectIds);
    for (const a of integration.accounts) {
      nextAccounts.delete(a.id);
      for (const p of a.products ?? []) {
        nextProjects.delete(p.id);
      }
    }
    onFilterChange(nextAccounts, nextProjects);
  };

  const toggleAccount = (account: AccountInfo) => {
    const nextAccounts = new Set(enabledAccountIds);
    const nextProjects = new Set(enabledProjectIds);
    if (nextAccounts.has(account.id)) {
      nextAccounts.delete(account.id);
      // Also disable all products for this account
      for (const p of account.products ?? []) {
        nextProjects.delete(p.id);
      }
    } else {
      nextAccounts.add(account.id);
      // Also enable all products for this account
      for (const p of account.products ?? []) {
        nextProjects.add(p.id);
      }
    }
    onFilterChange(nextAccounts, nextProjects);
  };

  const toggleProduct = (product: ProductInfo) => {
    const nextProjects = new Set(enabledProjectIds);
    if (nextProjects.has(product.id)) {
      nextProjects.delete(product.id);
    } else {
      nextProjects.add(product.id);
    }
    onFilterChange(new Set(enabledAccountIds), nextProjects);
  };

  const toggleAccountExpanded = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

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
        const lightBg = isLightColor(integration.color);
        const activeTextClass = lightBg ? "text-black" : "text-white";
        const totalProducts = integration.accounts.reduce(
          (sum, a) => sum + (a.products?.length ?? 0),
          0
        );

        return (
          <div key={integration.id} className="relative">
            {/* Integration pill */}
            <button
              type="button"
              onClick={() =>
                setOpenIntegration(isOpen ? null : integration.id)
              }
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                allEnabled
                  ? `border-transparent ${activeTextClass}`
                  : someEnabled
                    ? `border-transparent ${activeTextClass} opacity-80`
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
              <div className="absolute left-0 top-full z-10 mt-1 min-w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
                {/* Toggle all */}
                <button
                  type="button"
                  onClick={() =>
                    allEnabled
                      ? disableAllAccounts(integration)
                      : enableAllAccounts(integration)
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      allEnabled
                        ? `border-transparent ${activeTextClass}`
                        : someEnabled
                          ? `border-transparent ${activeTextClass}`
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

                {/* Individual accounts + nested products */}
                {integration.accounts.map((account) => {
                  const isAccountEnabled = enabledAccountIds.has(account.id);
                  const products = account.products ?? [];
                  const hasProducts = products.length > 0;
                  const isExpanded = expandedAccounts.has(account.id);
                  const enabledProductCount = products.filter((p) =>
                    enabledProjectIds.has(p.id)
                  ).length;
                  const allProductsEnabled = hasProducts && enabledProductCount === products.length;
                  const someProductsEnabled = enabledProductCount > 0 && !allProductsEnabled;

                  return (
                    <div key={account.id}>
                      <div className="flex items-center">
                        {/* Expand chevron (only if products exist) */}
                        {hasProducts ? (
                          <button
                            type="button"
                            onClick={() => toggleAccountExpanded(account.id)}
                            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 transition-transform",
                                isExpanded && "rotate-90"
                              )}
                            />
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}

                        {/* Account toggle */}
                        <button
                          type="button"
                          onClick={() => toggleAccount(account)}
                          className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-accent"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              isAccountEnabled
                                ? `border-transparent ${activeTextClass}`
                                : "border-border"
                            )}
                            style={
                              isAccountEnabled
                                ? { backgroundColor: integration.color }
                                : undefined
                            }
                          >
                            {isAccountEnabled && <Check className="h-3 w-3" />}
                          </span>
                          <span
                            className={cn(
                              "truncate",
                              isAccountEnabled
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {account.label}
                          </span>
                          {hasProducts && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {someProductsEnabled
                                ? `${enabledProductCount}/${products.length}`
                                : products.length}{" "}
                              {products.length === 1 ? "product" : "products"}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Nested products */}
                      {hasProducts && isExpanded && (
                        <div className="ml-5 border-l border-border/50 pl-2">
                          {products.map((product) => {
                            const isProductEnabled = enabledProjectIds.has(product.id);
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => toggleProduct(product)}
                                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[11px] hover:bg-accent"
                              >
                                <span
                                className={cn(
                                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                                  isProductEnabled
                                    ? `border-transparent ${activeTextClass}`
                                    : "border-border"
                                )}
                                style={
                                  isProductEnabled
                                    ? { backgroundColor: integration.color }
                                      : undefined
                                  }
                                >
                                  {isProductEnabled && <Check className="h-2.5 w-2.5" />}
                                </span>
                                <span
                                  className={cn(
                                    "truncate",
                                    isProductEnabled
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {product.label}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
