/**
 * Offline-first sync helper. Local writes are queued to localStorage until
 * the network reports online, then replayed against Lovable Cloud. Pure
 * logic — no DOM access — so it stays test-friendly.
 */
export interface SyncOp {
  id: string;
  scope: string;
  payload: unknown;
  queuedAt: number;
}

export interface SyncState {
  queue: SyncOp[];
  lastSyncAt: number | null;
}

export function emptyState(): SyncState {
  return { queue: [], lastSyncAt: null };
}

export function enqueue(state: SyncState, op: Omit<SyncOp, "id" | "queuedAt">): SyncState {
  const next: SyncOp = {
    ...op,
    id: `${op.scope}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
  };
  return { ...state, queue: [...state.queue, next] };
}

/**
 * Conflict-resolution rule: latest write wins per scope. The client only
 * flushes the newest queued op per scope and drops earlier ones.
 */
export function collapseByScope(state: SyncState): SyncState {
  const latest = new Map<string, SyncOp>();
  for (const op of state.queue) {
    const prev = latest.get(op.scope);
    if (!prev || prev.queuedAt < op.queuedAt) latest.set(op.scope, op);
  }
  return { ...state, queue: Array.from(latest.values()) };
}

export function markSynced(state: SyncState, ids: readonly string[], at: number): SyncState {
  const done = new Set(ids);
  return {
    queue: state.queue.filter((o) => !done.has(o.id)),
    lastSyncAt: at,
  };
}