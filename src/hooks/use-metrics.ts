"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricData {
  id: string;
  accountId: string;
  metricType: string;
  value: number;
  currency: string | null;
  date: string;
  metadata: string;
}

export interface MetricsResponse {
  metrics: MetricData[];
  accounts: Record<string, string>;
}

export interface AggregatedMetric {
  metricType: string;
  total: number;
  currency: string | null;
  count: number;
}

interface ProductMetricData extends MetricData {
  projectId: string | null;
}

export interface ProductMetricsResponse {
  metrics: ProductMetricData[];
  projects: Record<string, { label: string; accountId: string }>;
  accounts: Record<string, string>;
}

export interface ProductAggregatedMetric {
  projectId: string | null;
  metricType: string;
  total: number;
  currency: string | null;
  count: number;
}

// ─── useMetrics ───────────────────────────────────────────────────────────────

interface UseMetricsOptions {
  accountId?: string;
  /** Filter by multiple account IDs. Takes precedence over accountId. */
  accountIds?: string[];
  metricType?: string;
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
  const isInitialLoad = useRef(true);

  const accountIdsKey = options.accountIds?.join(",") ?? "";

  const fetchMetrics = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (accountIdsKey) {
        params.set("accountIds", accountIdsKey);
      } else if (options.accountId) {
        params.set("accountId", options.accountId);
      }
      if (options.metricType) params.set("metricType", options.metricType);
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
      if (isInitialLoad.current) setLoading(false);
      isInitialLoad.current = false;
    }
  }, [
    accountIdsKey,
    options.accountId,
    options.metricType,
    options.from,
    options.to,
    options.aggregation,
  ]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}

// ─── useProductMetrics ────────────────────────────────────────────────────────

interface UseProductMetricsOptions {
  accountIds?: string[];
  projectId?: string;
  metricType?: string;
  from?: string;
  to?: string;
  aggregation?: "daily" | "total";
}

export function useProductMetrics(options: UseProductMetricsOptions = {}) {
  const [data, setData] = useState<ProductMetricsResponse | ProductAggregatedMetric[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const accountIdsKey = options.accountIds?.join(",") ?? "";

  const fetchProductMetrics = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (accountIdsKey) params.set("accountIds", accountIdsKey);
      if (options.projectId) params.set("projectId", options.projectId);
      if (options.metricType) params.set("metricType", options.metricType);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.aggregation) params.set("aggregation", options.aggregation);

      const result = await apiGet<ProductMetricsResponse | ProductAggregatedMetric[]>(
        `/api/metrics/products?${params.toString()}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (isInitialLoad.current) setLoading(false);
      isInitialLoad.current = false;
    }
  }, [
    accountIdsKey,
    options.projectId,
    options.metricType,
    options.from,
    options.to,
    options.aggregation,
  ]);

  useEffect(() => {
    fetchProductMetrics();
  }, [fetchProductMetrics]);

  return { data, loading, error, refetch: fetchProductMetrics };
}

// ─── useProjectGroups ──────────────────────────────────────────────────────────

export interface ProjectGroupMemberResponse {
  id: string;
  accountId: string;
  projectId: string | null;
  accountLabel: string;
  projectLabel: string | null;
  integrationId: string | null;
}

export interface ProjectGroupResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: ProjectGroupMemberResponse[];
}

export function useProjectGroups() {
  const [data, setData] = useState<ProjectGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const fetchGroups = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    try {
      const result = await apiGet<ProjectGroupResponse[]>("/api/project-groups");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (isInitialLoad.current) setLoading(false);
      isInitialLoad.current = false;
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return { data, loading, error, refetch: fetchGroups };
}

// ─── useCustomersByCountry ──────────────────────────────────────────────────

export interface CountryCustomers {
  country: string;
  count: number;
}

export interface CountrySourceBreakdown {
  country: string;
  count: number;
  accountId: string;
  projectId: string | null;
}

export interface CustomersByCountryResponse {
  totals: CountryCustomers[];
  bySource: CountrySourceBreakdown[];
  accounts: Record<string, string>;
  projects: Record<string, { label: string; accountId: string }>;
}

export type CustomerCountryType = "paying" | "all";

interface UseCustomersByCountryOptions {
  accountIds?: string[];
  from?: string;
  to?: string;
  /** "paying" (default) shows only paying customers; "all" includes free users */
  type?: CustomerCountryType;
}

export function useCustomersByCountry(options: UseCustomersByCountryOptions = {}) {
  const [data, setData] = useState<CustomersByCountryResponse>({
    totals: [],
    bySource: [],
    accounts: {},
    projects: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const accountIdsKey = options.accountIds?.join(",") ?? "";
  const type = options.type ?? "paying";

  const fetchData = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (accountIdsKey) params.set("accountIds", accountIdsKey);
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      params.set("type", type);

      const result = await apiGet<CustomersByCountryResponse>(
        `/api/metrics/customers-by-country?${params.toString()}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (isInitialLoad.current) setLoading(false);
      isInitialLoad.current = false;
    }
  }, [accountIdsKey, options.from, options.to, type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ─── useIntegrations ──────────────────────────────────────────────────────────

export function useIntegrations() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const fetchIntegrations = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    try {
      const result = await apiGet<any[]>("/api/integrations");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (isInitialLoad.current) setLoading(false);
      isInitialLoad.current = false;
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return { data, loading, error, refetch: fetchIntegrations };
}
