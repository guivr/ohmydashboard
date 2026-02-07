import type { IntegrationDefinition } from "./types";

/**
 * Integration Registry
 *
 * Central place to register and discover all available integrations.
 * Each integration registers itself by calling `registerIntegration()`.
 *
 * This is intentionally simple — no dynamic loading, no filesystem scanning.
 * To add a new integration, add it to `loadAllIntegrations()` below.
 */

const integrations = new Map<string, IntegrationDefinition>();

/**
 * Register an integration with the registry.
 */
export function registerIntegration(definition: IntegrationDefinition): void {
  if (integrations.has(definition.id)) {
    console.warn(
      `Integration "${definition.id}" is already registered. Skipping duplicate.`
    );
    return;
  }
  integrations.set(definition.id, definition);
}

/**
 * Get an integration by its ID.
 */
export function getIntegration(
  id: string
): IntegrationDefinition | undefined {
  return integrations.get(id);
}

/**
 * Get all registered integrations.
 */
export function getAllIntegrations(): IntegrationDefinition[] {
  return Array.from(integrations.values());
}

/**
 * Check if an integration is registered.
 */
export function hasIntegration(id: string): boolean {
  return integrations.has(id);
}

/**
 * Clear all registered integrations (useful for testing).
 */
export function clearRegistry(): void {
  integrations.clear();
}

let _loaded = false;

/**
 * Load all integrations. Call this once at app startup.
 * Separated from module-level to avoid circular import issues.
 */
export async function loadAllIntegrations(): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  // Import each integration — they self-register via registerIntegration()
  await import("./stripe");
  await import("./gumroad");
}

/**
 * Reset the loaded state (for testing).
 */
export function resetRegistry(): void {
  clearRegistry();
  _loaded = false;
}
