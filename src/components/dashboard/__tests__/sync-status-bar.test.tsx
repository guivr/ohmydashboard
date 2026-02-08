import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SyncStatusBar } from "../sync-status-bar";
import * as apiClient from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiPost: vi.fn(),
}));

describe("SyncStatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show syncing state with account name when syncing", async () => {
    // Create a delayed promise so we can see the syncing state
    vi.mocked(apiClient.apiPost).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, recordsProcessed: 42 }),
            100
          )
        )
    );

    const onSyncComplete = vi.fn();

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
        ]}
        onSyncComplete={onSyncComplete}
        autoSync={true}
      />
    );

    // Should show syncing state with account label and integration name
    await waitFor(() => {
      expect(
        screen.getByText(/Syncing Account 1 \(Stripe\)/)
      ).toBeInTheDocument();
    });
  });

  it("should show account count in progress", async () => {
    vi.mocked(apiClient.apiPost).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, recordsProcessed: 10 }),
            50
          )
        )
    );

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
          { id: "acc2", label: "Account 2", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    });
  });

  it("should show done state with summary after sync completes", async () => {
    vi.mocked(apiClient.apiPost).mockResolvedValue({
      success: true,
      recordsProcessed: 42,
    });

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByText(/Synced/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should handle cooldown gracefully", async () => {
    vi.mocked(apiClient.apiPost).mockRejectedValue(
      new Error("Sync cooldown: please wait 30s")
    );

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    await waitFor(
      () => {
        expect(
          screen.getByText(/Already up to date|Synced/)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should call onSyncComplete after each account syncs", async () => {
    vi.mocked(apiClient.apiPost).mockResolvedValue({
      success: true,
      recordsProcessed: 10,
    });

    const onSyncComplete = vi.fn();

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
        ]}
        onSyncComplete={onSyncComplete}
        autoSync={true}
      />
    );

    await waitFor(
      () => {
        expect(onSyncComplete).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it("should not render when no accounts provided", () => {
    const { container } = render(
      <SyncStatusBar
        accounts={[]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("should show dropdown with sync steps and durations when summary is clicked", async () => {
    vi.mocked(apiClient.apiPost).mockResolvedValue({
      success: true,
      recordsProcessed: 42,
      steps: [
        {
          key: "fetch_charges",
          label: "Fetch charges & revenue",
          status: "success",
          recordCount: 30,
          durationMs: 1230,
        },
        {
          key: "fetch_subscriptions",
          label: "Fetch subscriptions & MRR",
          status: "success",
          recordCount: 10,
          durationMs: 850,
        },
        {
          key: "fetch_customers",
          label: "Fetch new customers",
          status: "success",
          recordCount: 2,
          durationMs: 340,
        },
      ],
    });

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "My SaaS", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    // Wait for sync to finish
    await waitFor(
      () => {
        expect(screen.getByText(/Synced/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Click the summary to open the dropdown
    const summaryButton = screen.getByText(/Synced/).closest("button")!;
    fireEvent.click(summaryButton);

    // Should show the sync log header
    expect(screen.getByText("Sync log")).toBeInTheDocument();

    // Should show account name
    expect(screen.getByText("My SaaS")).toBeInTheDocument();

    // Should show step labels
    expect(screen.getByText(/Fetch charges & revenue/)).toBeInTheDocument();
    expect(
      screen.getByText(/Fetch subscriptions & MRR/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Fetch new customers/)).toBeInTheDocument();

    // Should show step durations
    expect(screen.getByText("1.2s")).toBeInTheDocument();
    expect(screen.getByText("850ms")).toBeInTheDocument();
    expect(screen.getByText("340ms")).toBeInTheDocument();
  });

  it("should show X icon for failed steps in dropdown", async () => {
    vi.mocked(apiClient.apiPost).mockResolvedValue({
      success: true,
      recordsProcessed: 30,
      steps: [
        {
          key: "fetch_charges",
          label: "Fetch charges & revenue",
          status: "success",
          recordCount: 30,
        },
        {
          key: "fetch_subscriptions",
          label: "Fetch subscriptions & MRR",
          status: "error",
          error: "Permission denied",
        },
        {
          key: "fetch_customers",
          label: "Fetch new customers",
          status: "success",
          recordCount: 5,
        },
      ],
    });

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "My SaaS", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    // Wait for sync to finish
    await waitFor(
      () => {
        expect(screen.getByText(/Synced/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Open the dropdown
    const summaryButton = screen.getByText(/Synced/).closest("button")!;
    fireEvent.click(summaryButton);

    // Should show the error text
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });

  it("should show pending accounts in the dropdown during sync", async () => {
    let resolveFirst: (value: any) => void;
    let callCount = 0;

    vi.mocked(apiClient.apiPost).mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          if (callCount === 1) {
            resolveFirst = resolve;
          } else {
            // Second account resolves immediately
            resolve({ success: true, recordsProcessed: 5 });
          }
        })
    );

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "Account 1", integrationName: "Stripe" },
          { id: "acc2", label: "Account 2", integrationName: "Stripe" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    // Wait for syncing state to appear, then click to open dropdown
    await waitFor(() => {
      expect(
        screen.getByText(/Syncing Account 1/)
      ).toBeInTheDocument();
    });

    const summaryButton = screen
      .getByText(/Syncing Account 1/)
      .closest("button")!;
    fireEvent.click(summaryButton);

    // Should show Sync log header
    expect(screen.getByText("Sync log")).toBeInTheDocument();

    // Account 1 should be visible as currently syncing
    expect(screen.getByText("Account 1")).toBeInTheDocument();
    // Account 2 should be pending
    expect(screen.getByText("Account 2")).toBeInTheDocument();

    // Resolve first account to let sync complete
    resolveFirst!({
      success: true,
      recordsProcessed: 10,
      steps: [
        {
          key: "fetch_charges",
          label: "Fetch charges & revenue",
          status: "success",
          recordCount: 10,
        },
      ],
    });

    // Wait for done
    await waitFor(
      () => {
        expect(
          screen.getByText(/Synced|Already up to date/)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should refresh a specific account from the sync log", async () => {
    vi.mocked(apiClient.apiPost).mockResolvedValue({
      success: true,
      recordsProcessed: 0,
    });

    render(
      <SyncStatusBar
        accounts={[
          { id: "acc1", label: "My SaaS", integrationName: "RevenueCat" },
        ]}
        onSyncComplete={vi.fn()}
        autoSync={true}
      />
    );

    await waitFor(
      () => {
        expect(
          screen.getByText(/Synced|Already up to date/)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const summaryButton = screen
      .getByText(/Synced|Already up to date/)
      .closest("button")!;
    fireEvent.click(summaryButton);

    const refreshButton = screen.getByRole("button", {
      name: "Refresh My SaaS",
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(apiClient.apiPost).toHaveBeenCalledTimes(2);
      expect(apiClient.apiPost).toHaveBeenLastCalledWith("/api/sync", {
        accountId: "acc1",
      });
    });
  });
});
