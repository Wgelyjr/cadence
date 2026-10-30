import { getSupabase } from './supabase';
import { isSupabaseConfigured } from './config';
import type { CareEvent, Child } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sync engine — "start simple", last-write-wins.
 *
 * Local (IndexedDB) is the source of truth. When Supabase is configured and
 * the device is online, we:
 *   1. PUSH  every local row (server applies LWW via guarded upsert), and
 *   2. PULL  remote rows newer than our watermark and merge them locally
 *      (LWW by updated_at).
 *
 * Deletions are soft (deleted = true) so they propagate, then can be purged.
 */

export type SyncResult = {
  ok: boolean;
  pushed?: number;
  pulled?: number;
  error?: string;
};

function groupForRows<T extends { care_group_id?: string }>(rows: T[]): string | null {
  for (const r of rows) if (r.care_group_id) return r.care_group_id;
  return null;
}

export async function syncPush(
  sb: SupabaseClient,
  children: Child[],
  events: CareEvent[],
): Promise<{ children?: number; events?: number }> {
  const out: { children?: number; events?: number } = {};

  const liveChildren = children.filter((c) => c.care_group_id);
  const liveEvents = events.filter((e) => e.care_group_id);

  if (liveChildren.length) {
    const groupId = groupForRows(liveChildren)!;
    // Pass the raw array — supabase-js serializes the RPC params to JSON.
    // Stringifying here would double-encode it and Postgres would receive a
    // scalar string ("cannot extract elements from a scalar").
    const { error } = await sb.rpc('upsert_children', {
      rows: liveChildren,
      care_group_id: groupId,
    });
    if (error) throw new Error(`push children: ${error.message}`);
    out.children = liveChildren.length;
  }

  if (liveEvents.length) {
    const groupId = groupForRows(liveEvents)!;
    // Batch to stay under payload limits.
    const CHUNK = 200;
    for (let i = 0; i < liveEvents.length; i += CHUNK) {
      const slice = liveEvents.slice(i, i + CHUNK);
      const { error } = await sb.rpc('upsert_events', {
        rows: slice,
        care_group_id: groupId,
      });
      if (error) throw new Error(`push events: ${error.message}`);
    }
    out.events = liveEvents.length;
  }

  return out;
}

export async function syncPull(
  sb: SupabaseClient,
  groupId: string,
  sinceIso: string,
): Promise<{ children: Child[]; events: CareEvent[]; watermark: string }> {
  const [cRes, eRes] = await Promise.all([
    sb.from('children').select('*').eq('care_group_id', groupId),
    sb.from('care_events').select('*').eq('care_group_id', groupId),
  ]);
  if (cRes.error) throw new Error(`pull children: ${cRes.error.message}`);
  if (eRes.error) throw new Error(`pull events: ${eRes.error.message}`);

  const children = (cRes.data ?? []) as unknown as Child[];
  const events = (eRes.data ?? []) as unknown as CareEvent[];

  // Watermark = newest updated_at we just saw (or now, if empty).
  const stamps = [
    ...children.map((c) => c.updated_at),
    ...events.map((e) => e.updated_at),
  ].sort();
  const watermark = stamps.length ? stamps[stamps.length - 1] : sinceIso;

  return { children, events, watermark };
}

/**
 * Merge remote rows into local arrays using last-write-wins on updated_at.
 * Returns the merged arrays plus the set of ids that changed locally.
 */
export function mergeRemote<T extends { id: string; updated_at: string }>(
  local: T[],
  remote: T[],
): T[] {
  const map = new Map(local.map((r) => [r.id, { ...r }]));
  for (const r of remote) {
    const existing = map.get(r.id);
    if (!existing || existing.updated_at < r.updated_at) {
      map.set(r.id, { ...r });
    }
  }
  return [...map.values()];
}

/** Read/write the per-group pull watermark (localStorage, keyed by group). */
export function readWatermark(groupId: string): string {
  try {
    return localStorage.getItem(`babyapp:wm:${groupId}`) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
export function writeWatermark(groupId: string, iso: string) {
  try {
    localStorage.setItem(`babyapp:wm:${groupId}`, iso);
  } catch {
    /* ignore */
  }
}

export async function ensureCareGroup(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb
    .from('care_groups')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return null;
  if (data && data.length) return data[0].id as string;
  // No group yet (e.g. trigger didn't run) — create one.
  const { data: created, error: cErr } = await sb
    .from('care_groups')
    .insert({ name: 'My care group' })
    .select('id')
    .single();
  if (cErr || !created) return null;
  return created.id as string;
}

export function isSyncActive(): boolean {
  return isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine;
}

export function getSyncClient(): SupabaseClient | null {
  return getSupabase();
}
