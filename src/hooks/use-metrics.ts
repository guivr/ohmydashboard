"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api-client";

interface MetricData {
  id: string;
  accountId: string;
  metricType: string;
  value: number;
  currency: string | null;
  date: string;
  metadata: string;
}

interface MetricsResponse {
  metrics: MetricData[];
  accounts: Record<string, string>;
}

interface AggregatedMetric {
  metricType: string;
  total: number;
  currency: string | null;
  count: number;
}

interface UseMetricsOptions {
  accountId?: string;
  /** Filter by multiple account IDs. Takes precedence over accountId. */
  accountIds?: string[];
  metricType?: string;
  /** Filter by project/product ID */
  projectId?: string;
  /** "true" for per-project only, "false" for account-level only */
  withProject?: "true" | "false";
  from?: string;
  to?: string;
  aggregation?: "daily" | "total";
}

export function useMetrics(options: UseMetricsOptions = {}) {
  const [data, setData] = useState<MetricsResponse | AggregatedMetric[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize accountIds array to a stable string for dependency tracking
  const accountIdsKey = options.accountIds?.join(",") ?? "";

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (accountIdsKey) {
        params.set("accountIds", accountIdsKey);
      } else if (options.accountId) {
        params.set("accountId", options.accountId);
      }
      if (options.metricType) params.set("metricType", options.metricType);
      if (options.projectId) params.set("projectId", options.projectId);
      if (options.withProject) params.set("withProject", options.withProject);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.aggregation) params.set("aggregation", options.aggregation);

      const result = await apiGet<MetricsResponse | AggregatedMetric[]>(
        `/api/metrics?${params.toString()}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    accountIdsKey,
    options.accountId,
    options.metricType,
    options.projectId,
    options.withProject,
    options.from,
    options.to,
    options.aggregation,
  ]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}

export function useIntegrations() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<any[]>("/api/integrations");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return { data, loading, error, refetch: fetchIntegrations };
}
