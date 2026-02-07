"use client";

import { useIntegrations, useProjectGroups } from "@/hooks/use-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddAccountDialog } from "@/components/settings/add-account-dialog";
import { AccountList } from "@/components/settings/account-list";
import { Separator } from "@/components/ui/separator";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import { IntegrationLogo } from "@/components/integration-logo";
import { ProjectGroupsManager } from "@/components/settings/project-groups-manager";

export default function SettingsPage() {
  const { data: integrations, loading, refetch } = useIntegrations();
  const { data: projectGroups, loading: groupsLoading, refetch: refetchGroups } = useProjectGroups();

  const handleDelete = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this account? This will remove all associated data.")) {
      return;
    }

    await apiDelete(`/api/integrations/${accountId}`);
    refetch();
  };

  const handleToggle = async (accountId: string, isActive: boolean) => {
    await apiPatch(`/api/integrations/${accountId}`, { isActive });
    refetch();
  };

  const handleSync = async (accountId: string) => {
    await apiPost("/api/sync", { accountId });
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your connected integrations and accounts.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      )}

      {/* Project Groups */}
      {!loading && !groupsLoading && (
        <div className="mb-6">
          <ProjectGroupsManager
            groups={projectGroups}
            integrations={integrations}
            onGroupsChanged={refetchGroups}
          />
        </div>
      )}

      {/* Integrations */}
      {!loading && (
        <div className="space-y-6">
          {integrations.map((integration: any) => (
            <Card key={integration.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${integration.color}20` }}
                  >
                    <IntegrationLogo integration={integration.name} size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {integration.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                </div>
                <AddAccountDialog
                  integrationId={integration.id}
                  integrationName={integration.name}
                  credentials={integration.credentials}
                  requiredPermissions={integration.requiredPermissions}
                  onAccountAdded={refetch}
                />
              </CardHeader>

              {integration.accounts.length > 0 && (
                <>
                  <Separator />
                  <CardContent className="pt-4">
                    <AccountList
                      accounts={integration.accounts}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                      onSync={handleSync}
                    />
                  </CardContent>
                </>
              )}
            </Card>
          ))}

          {/* Coming Soon integrations */}
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">
              Coming Soon
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                { name: "RevenueCat", icon: "Smartphone", color: "#F2545B" },
                {
                  name: "App Store Connect",
                  icon: "Smartphone",
                  color: "#0D7AFF",
                },
                { name: "Mixpanel", icon: "BarChart3", color: "#7856FF" },
                { name: "X (Twitter)", icon: "Users", color: "#1DA1F2" },
                {
                  name: "Facebook Ads",
                  icon: "Megaphone",
                  color: "#1877F2",
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 opacity-50"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${item.color}20` }}
                  >
                    <IntegrationLogo integration={item.name} size={16} />
                  </div>
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
