"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IntegrationLogo } from "@/components/integration-logo";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  FolderKanban,
  Check,
} from "lucide-react";
import { apiPost, apiDelete } from "@/lib/api-client";
import type { ProjectGroupResponse } from "@/hooks/use-metrics";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemberSelection {
  accountId: string;
  projectId: string | null;
}

interface IntegrationData {
  id: string;
  name: string;
  color: string;
  accounts: Array<{
    id: string;
    label: string;
    isActive: boolean;
    products: Array<{ id: string; label: string }>;
  }>;
}

interface ProjectGroupsManagerProps {
  groups: ProjectGroupResponse[];
  integrations: IntegrationData[];
  onGroupsChanged: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProjectGroupsManager({
  groups,
  integrations,
  onGroupsChanged,
}: ProjectGroupsManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProjectGroupResponse | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingGroup(null);
    setDialogOpen(true);
  };

  const handleEdit = (group: ProjectGroupResponse) => {
    setEditingGroup(group);
    setDialogOpen(true);
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm("Delete this project group? This cannot be undone.")) return;
    setDeletingId(groupId);
    try {
      await apiDelete(`/api/project-groups/${groupId}`);
      onGroupsChanged();
    } finally {
      setDeletingId(null);
    }
  };

  const handleDialogSaved = () => {
    setDialogOpen(false);
    setEditingGroup(null);
    onGroupsChanged();
  };

  // Build a lookup for integration name by account ID
  const integrationByAccountId = new Map<string, string>();
  for (const integration of integrations) {
    for (const account of integration.accounts) {
      integrationByAccountId.set(account.id, integration.name);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Project Groups</CardTitle>
            <p className="text-sm text-muted-foreground">
              Merge products from different integrations into a single dashboard
              entry.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleCreate}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create Group
        </Button>
      </CardHeader>

      {groups.length > 0 && (
        <>
          <Separator />
          <CardContent className="pt-4">
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{group.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.members.map((member) => {
                        const integrationName =
                          member.integrationId
                            ? integrationByAccountId.get(member.accountId) ??
                              member.integrationId
                            : "Unknown";
                        return (
                          <Badge
                            key={member.id}
                            variant="secondary"
                            className="gap-1.5 text-xs"
                          >
                            <IntegrationLogo
                              integration={integrationName}
                              size={12}
                            />
                            {member.projectLabel ?? member.accountLabel}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(group)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={deletingId === group.id}
                      onClick={() => handleDelete(group.id)}
                    >
                      {deletingId === group.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </>
      )}

      <GroupFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingGroup(null);
        }}
        integrations={integrations}
        editingGroup={editingGroup}
        onSaved={handleDialogSaved}
      />
    </Card>
  );
}

// ─── Form Dialog ────────────────────────────────────────────────────────────

interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrations: IntegrationData[];
  editingGroup: ProjectGroupResponse | null;
  onSaved: () => void;
}

function GroupFormDialog({
  open,
  onOpenChange,
  integrations,
  editingGroup,
  onSaved,
}: GroupFormDialogProps) {
  const isEdit = editingGroup !== null;

  const [name, setName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<MemberSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      if (editingGroup) {
        setName(editingGroup.name);
        setSelectedMembers(
          editingGroup.members.map((m) => ({
            accountId: m.accountId,
            projectId: m.projectId,
          }))
        );
      } else {
        setName("");
        setSelectedMembers([]);
      }
      setError(null);
    }
    onOpenChange(next);
  };

  const toggleMember = (accountId: string, projectId: string | null) => {
    setSelectedMembers((prev) => {
      const exists = prev.some(
        (m) => m.accountId === accountId && m.projectId === projectId
      );
      if (exists) {
        return prev.filter(
          (m) => !(m.accountId === accountId && m.projectId === projectId)
        );
      }
      return [...prev, { accountId, projectId }];
    });
  };

  const isMemberSelected = (accountId: string, projectId: string | null) => {
    return selectedMembers.some(
      (m) => m.accountId === accountId && m.projectId === projectId
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMembers.length === 0) {
      setError("Select at least one account or product.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        // Use PUT via raw fetch since we don't have apiPut
        const response = await fetch(
          `/api/project-groups/${editingGroup.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-omd-request": "1",
            },
            body: JSON.stringify({
              name: name.trim(),
              members: selectedMembers,
            }),
          }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Request failed: ${response.status}`);
        }
      } else {
        await apiPost("/api/project-groups", {
          name: name.trim(),
          members: selectedMembers,
        });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Flatten integrations into a tree for the selection UI
  const hasProducts = integrations.some((i) =>
    i.accounts.some((a) => a.products.length > 0)
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit Project Group" : "Create Project Group"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the group name or members."
                : "Group products from different integrations so they appear as one entry in the dashboard."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Group name */}
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder='e.g., "CSS Pro"'
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Member selection */}
            <div className="space-y-2">
              <Label>
                Members{" "}
                <span className="text-muted-foreground font-normal">
                  ({selectedMembers.length} selected)
                </span>
              </Label>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                {integrations.map((integration) => {
                  const activeAccounts = integration.accounts.filter(
                    (a) => a.isActive
                  );
                  if (activeAccounts.length === 0) return null;

                  return (
                    <div key={integration.id}>
                      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <IntegrationLogo
                          integration={integration.name}
                          size={14}
                        />
                        {integration.name}
                      </div>
                      <div className="space-y-1 pl-1">
                        {activeAccounts.map((account) => {
                          const hasProds = account.products.length > 0;

                          return (
                            <div key={account.id}>
                              {/* Account-level toggle (only when no products, or to select entire account) */}
                              {!hasProds && (
                                <SelectableRow
                                  label={account.label}
                                  selected={isMemberSelected(
                                    account.id,
                                    null
                                  )}
                                  onToggle={() =>
                                    toggleMember(account.id, null)
                                  }
                                />
                              )}
                              {hasProds && (
                                <>
                                  <div className="mb-0.5 text-xs font-medium text-foreground/70">
                                    {account.label}
                                  </div>
                                  {account.products.map((product) => (
                                    <SelectableRow
                                      key={product.id}
                                      label={product.label}
                                      indent
                                      selected={isMemberSelected(
                                        account.id,
                                        product.id
                                      )}
                                      onToggle={() =>
                                        toggleMember(
                                          account.id,
                                          product.id
                                        )
                                      }
                                    />
                                  ))}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Selectable Row ─────────────────────────────────────────────────────────

function SelectableRow({
  label,
  selected,
  onToggle,
  indent = false,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-accent ${
        indent ? "pl-4" : ""
      } ${selected ? "bg-accent/50" : ""}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border"
        }`}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
