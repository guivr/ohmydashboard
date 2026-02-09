"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, Pause, Play } from "lucide-react";

interface Account {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
}

interface AccountListProps {
  accounts: Account[];
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onSync: (id: string) => void;
}

export function AccountList({
  accounts,
  onDelete,
  onToggle,
  onSync,
}: AccountListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No accounts connected yet.
      </p>
    );
  }

  const handleSync = async (id: string) => {
    setLoadingId(id);
    await onSync(id);
    setLoadingId(null);
  };

  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-gradient-to-r from-muted/40 to-transparent px-4 py-3 transition hover:border-border"
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                {account.label}
                <span
                  className={`h-2 w-2 rounded-full ${
                    account.isActive ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  aria-hidden
                />
              </p>
              <p className="text-xs text-muted-foreground">
                Connected{" "}
                {new Date(account.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/70 p-1 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleSync(account.id)}
              disabled={loadingId === account.id || !account.isActive}
              title="Sync now"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingId === account.id ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggle(account.id, !account.isActive)}
              title={account.isActive ? "Pause" : "Resume"}
            >
              {account.isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(account.id)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
