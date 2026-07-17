# Architecture Guide

EagleBABA Astro Research Platform is a TanStack Start application backed by
Lovable Cloud. Phase 31 adds only the deployment framework; the runtime
shape is unchanged.

## Layers

1. Presentation — TanStack Router file routes under `src/routes/`.
2. Data / Query — TanStack Query, per-request `QueryClient`.
3. Server functions — `createServerFn` from `@tanstack/react-start`,
   authenticated via `requireSupabaseAuth` where user-scoped.
4. Providers — Upstox → INDstocks → Shoonya → Angel failover (Phase 29).
5. Research engines — Astro, SMC, Hybrid, Combined PCR, Market Breadth,
   GTI, Decision Center. Immutable in Phase 31.
6. Commercial SaaS — feature flags, coupons, rate limiting (Phase 30).
7. Deployment framework (Phase 31) — CI/CD, env validation, health,
   monitoring, structured logging, release management, deployment safety,
   backup/recovery, security audit.

## Immutability Boundaries

Phase 31 is strictly additive. Do not modify Astro / SMC / Hybrid / Decision
Center formulas, Combined PCR / Market Breadth / GTI classifiers, option
chain foundation, provider foundation, Run IDs, query keys, cache
namespaces, or broker/order-execution paths.
