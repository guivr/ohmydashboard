"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ExternalLink, Loader2, Shield, Eye, EyeOff } from "lucide-react";
import { apiPost } from "@/lib/api-client";

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  required?: boolean;
}

interface RequiredPermission {
  resource: string;
  label: string;
  access: "read" | "write" | "none";
  reason: string;
}

interface AddAccountDialogProps {
  integrationId: string;
  integrationName: string;
  credentials: CredentialField[];
  requiredPermissions?: RequiredPermission[];
  onAccountAdded: () => void;
}

const accessIcons: Record<string, React.ReactNode> = {
  read: <Eye className="h-3.5 w-3.5 text-emerald-500" />,
  write: <EyeOff className="h-3.5 w-3.5 text-amber-500" />,
  none: <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />,
};

const accessLabels: Record<string, string> = {
  read: "Read only",
  write: "Read & Write",
  none: "No access",
};

export function AddAccountDialog({
  integrationId,
  integrationName,
  credentials,
  requiredPermissions,
  onAccountAdded,
}: AddAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPost("/api/integrations", {
        integrationId,
        label: label || `My ${integrationName}`,
        credentials: credValues,
      });

      // Success — close dialog and refresh
      setOpen(false);
      setLabel("");
      setCredValues({});
      onAccountAdded();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-border/60 bg-background/80 shadow-sm">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect {integrationName}</DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect your {integrationName}{" "}
              account. Your credentials are stored locally and never sent to any
              server.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Required Permissions */}
            {requiredPermissions && requiredPermissions.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  Required permissions
                </div>
                <ul className="space-y-1.5">
                  {requiredPermissions.map((perm) => (
                    <li key={perm.resource} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 shrink-0">{accessIcons[perm.access]}</span>
                      <span>
                        <span className="font-medium">{perm.label}</span>
                        <span className="text-muted-foreground">
                          {" "}&middot; {accessLabels[perm.access]}
                        </span>
                        <span className="block text-muted-foreground">
                          {perm.reason}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Account Label */}
            <div className="space-y-2">
              <Label htmlFor="account-label">Account Name</Label>
              <Input
                id="account-label"
                placeholder={`e.g., My ${integrationName} Account`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A friendly name to identify this account (you can have
                multiple).
              </p>
            </div>

            {/* Credential Fields */}
            {credentials.map((cred) => (
              <div key={cred.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={cred.key}>{cred.label}</Label>
                  {cred.helpUrl && (
                    <a
                      href={cred.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Where to find this
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <Input
                  id={cred.key}
                  type={cred.type}
                  placeholder={cred.placeholder}
                  required={cred.required !== false}
                  value={credValues[cred.key] || ""}
                  onChange={(e) =>
                    setCredValues((prev) => ({
                      ...prev,
                      [cred.key]: e.target.value,
                    }))
                  }
                />
                {cred.helpText && (
                  <p className="text-xs text-muted-foreground">
                    {cred.helpText}
                  </p>
                )}
              </div>
            ))}

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Validating..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
