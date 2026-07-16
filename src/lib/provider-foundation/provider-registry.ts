import type { ProviderAdapter, ProviderDomain, ProviderRole } from "./types";

export class ProviderRegistry {
  private readonly byId = new Map<string, ProviderAdapter>();
  private readonly byDomainRole = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`Provider already registered: ${adapter.id}`);
    }
    this.byId.set(adapter.id, adapter);
    this.byDomainRole.set(this.domainRoleKey(adapter.capability.domain, adapter.role), adapter);
  }

  unregister(id: string): boolean {
    const adapter = this.byId.get(id);
    if (!adapter) return false;
    this.byId.delete(id);
    const key = this.domainRoleKey(adapter.capability.domain, adapter.role);
    if (this.byDomainRole.get(key)?.id === id) this.byDomainRole.delete(key);
    return true;
  }

  get(id: string): ProviderAdapter | null {
    return this.byId.get(id) ?? null;
  }

  resolve(domain: ProviderDomain, role: ProviderRole): ProviderAdapter | null {
    return this.byDomainRole.get(this.domainRoleKey(domain, role)) ?? null;
  }

  list(): readonly ProviderAdapter[] {
    return Array.from(this.byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  private domainRoleKey(domain: ProviderDomain, role: ProviderRole): string {
    return `${domain}::${role}`;
  }
}
