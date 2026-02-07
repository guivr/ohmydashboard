import { describe, it, expect, beforeEach } from "vitest";
import {
  registerIntegration,
  getIntegration,
  getAllIntegrations,
  hasIntegration,
  resetRegistry,
} from "../registry";
import type { IntegrationDefinition } from "../types";

function createMockIntegration(
  overrides: Partial<IntegrationDefinition> = {}
): IntegrationDefinition {
  return {
    id: "test-integration",
    name: "Test Integration",
    description: "A test integration",
    icon: "TestTube",
    color: "#000000",
    credentials: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
      },
    ],
    metricTypes: [
      {
        key: "revenue",
        label: "Revenue",
        format: "currency",
        description: "Total revenue",
      },
    ],
    fetcher: {
      sync: async () => ({
        success: true,
        recordsProcessed: 0,
        metrics: [],
      }),
      validateCredentials: async () => true,
    },
    ...overrides,
  };
}

describe("Integration Registry", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("should register and retrieve an integration", () => {
    const mock = createMockIntegration();
    registerIntegration(mock);

    const result = getIntegration("test-integration");
    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Integration");
  });

  it("should return undefined for unregistered integration", () => {
    const result = getIntegration("nonexistent");
    expect(result).toBeUndefined();
  });

  it("should list all registered integrations", () => {
    registerIntegration(createMockIntegration({ id: "a", name: "A" }));
    registerIntegration(createMockIntegration({ id: "b", name: "B" }));
    registerIntegration(createMockIntegration({ id: "c", name: "C" }));

    const all = getAllIntegrations();
    expect(all).toHaveLength(3);
    expect(all.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("should check if an integration exists", () => {
    registerIntegration(createMockIntegration());

    expect(hasIntegration("test-integration")).toBe(true);
    expect(hasIntegration("nonexistent")).toBe(false);
  });

  it("should not overwrite existing integration with same ID", () => {
    registerIntegration(
      createMockIntegration({ id: "dupe", name: "First" })
    );
    registerIntegration(
      createMockIntegration({ id: "dupe", name: "Second" })
    );

    const result = getIntegration("dupe");
    expect(result?.name).toBe("First");
  });

  it("should clear all integrations on reset", () => {
    registerIntegration(createMockIntegration({ id: "a" }));
    registerIntegration(createMockIntegration({ id: "b" }));

    expect(getAllIntegrations()).toHaveLength(2);

    resetRegistry();

    expect(getAllIntegrations()).toHaveLength(0);
  });

  it("should require all mandatory fields in IntegrationDefinition", () => {
    const integration = createMockIntegration();

    expect(integration.id).toBeDefined();
    expect(integration.name).toBeDefined();
    expect(integration.credentials).toBeDefined();
    expect(integration.credentials.length).toBeGreaterThan(0);
    expect(integration.fetcher).toBeDefined();
    expect(integration.fetcher.sync).toBeInstanceOf(Function);
    expect(integration.fetcher.validateCredentials).toBeInstanceOf(Function);
    expect(integration.metricTypes).toBeDefined();
  });
});
