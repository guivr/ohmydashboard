import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useMetrics, useIntegrations } from "../use-metrics";
import * as apiClient from "@/lib/api-client";
import { useEffect } from "react";

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
}));

function MetricsProbe({
  onUpdate,
}: {
  onUpdate: (state: { loading: boolean; refetch: () => Promise<void> }) => void;
}) {
  const { loading, refetch } = useMetrics({
    from: "2026-01-01",
    to: "2026-01-31",
  });

  useEffect(() => {
    onUpdate({ loading, refetch });
  }, [loading, refetch, onUpdate]);

  return null;
}

function IntegrationsProbe({
  onUpdate,
}: {
  onUpdate: (state: { loading: boolean; refetch: () => Promise<void> }) => void;
}) {
  const { loading, refetch } = useIntegrations();

  useEffect(() => {
    onUpdate({ loading, refetch });
  }, [loading, refetch, onUpdate]);

  return null;
}

describe("useMetrics loading behavior", () => {
  it("does not flip loading to true on refetch after initial load", async () => {
    let resolveInitial: (value: any) => void;
    const initialPromise = new Promise((resolve) => {
      resolveInitial = resolve;
    });
    vi.mocked(apiClient.apiGet).mockReturnValueOnce(initialPromise as any);

    const loadingStates: boolean[] = [];
    let currentRefetch: (() => Promise<void>) | null = null;
    let resolveRefetch: (value: any) => void;
    const refetchPromise = new Promise((resolve) => {
      resolveRefetch = resolve;
    });

    render(
      <MetricsProbe
        onUpdate={({ loading, refetch }) => {
          loadingStates.push(loading);
          currentRefetch = refetch;
        }}
      />
    );

    await act(async () => {
      resolveInitial!({ metrics: [], accounts: {} });
      await initialPromise;
    });

    await waitFor(() => {
      expect(loadingStates).toContain(false);
      expect(currentRefetch).toBeTruthy();
    });

    loadingStates.length = 0;

    vi.mocked(apiClient.apiGet).mockReturnValueOnce(refetchPromise as any);
    let pending: Promise<void>;
    await act(async () => {
      pending = currentRefetch!();
    });

    expect(loadingStates).not.toContain(true);

    resolveRefetch!({ metrics: [], accounts: {} });
    await act(async () => {
      await pending!;
    });
  });
});

describe("useIntegrations loading behavior", () => {
  it("does not flip loading to true on refetch after initial load", async () => {
    let resolveInitial: (value: any) => void;
    const initialPromise = new Promise((resolve) => {
      resolveInitial = resolve;
    });
    vi.mocked(apiClient.apiGet).mockReturnValueOnce(initialPromise as any);

    const loadingStates: boolean[] = [];
    let currentRefetch: (() => Promise<void>) | null = null;
    let resolveRefetch: (value: any) => void;
    const refetchPromise = new Promise((resolve) => {
      resolveRefetch = resolve;
    });

    render(
      <IntegrationsProbe
        onUpdate={({ loading, refetch }) => {
          loadingStates.push(loading);
          currentRefetch = refetch;
        }}
      />
    );

    await act(async () => {
      resolveInitial!([]);
      await initialPromise;
    });

    await waitFor(() => {
      expect(loadingStates).toContain(false);
      expect(currentRefetch).toBeTruthy();
    });

    loadingStates.length = 0;

    vi.mocked(apiClient.apiGet).mockReturnValueOnce(refetchPromise as any);
    let pending: Promise<void>;
    await act(async () => {
      pending = currentRefetch!();
    });

    expect(loadingStates).not.toContain(true);

    resolveRefetch!([]);
    await act(async () => {
      await pending!;
    });
  });
});
