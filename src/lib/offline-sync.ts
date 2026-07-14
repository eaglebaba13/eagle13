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

let _seq = 0;
function nextTs(state: SyncState): number {
  const now = Date.now();
  const last = state.queue.reduce((m, o) => Math.max(m, o.queuedAt), 0);
  const base = Math.max(now, last + 1);
  _seq = (_seq + 1) % 1_000_000;
  return base;
}

export function enqueue(state: SyncState, op: Omit<SyncOp, "id" | "queuedAt">): SyncState {
  const queuedAt = nextTs(state);
  const next: SyncOp = {
    ...op,
    id: `${op.scope}:${queuedAt}:${_seq.toString(36)}`,
    queuedAt,
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