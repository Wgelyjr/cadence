import { create } from 'zustand';
import type { CareEvent, Child, EventType } from './types';
import { nowIso, uid } from './utils';
import * as db from './db';
import { isSupabaseConfigured } from './config';
import { getSupabase } from './supabase';
import {
  ensureCareGroup,
  mergeRemote,
  readWatermark,
  syncPull,
  syncPush,
  writeWatermark,
} from './sync';

type SyncState = 'local-only' | 'idle' | 'syncing' | 'error' | 'offline';

interface AppState {
  ready: boolean;
  online: boolean;
  children: Child[];
  events: CareEvent[];
  activeChildId: string | null;
  syncState: SyncState;
  syncError: string | null;
  lastSyncAt: string | null;

  init: () => Promise<void>;
  setOnline: (b: boolean) => void;
  setActiveChild: (id: string) => void;

  addChild: (input: {
    name: string;
    birth_date: string;
    birth_time?: string;
    color?: string;
  }) => Promise<Child>;
  updateChild: (child: Child) => Promise<void>;
  removeChild: (id: string) => Promise<void>;

  addEvent: (
    input: Partial<CareEvent> & { type: EventType; child_id: string },
  ) => Promise<CareEvent>;
  updateEvent: (evt: CareEvent) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  importEvents: (
    childId: string,
    partials: Array<Partial<CareEvent>>,
  ) => Promise<{ added: number; skipped: number }>;

  deleteAccount: () => Promise<void>;
  sync: () => Promise<void>;
}

let syncTimer: number | undefined;

export const useAppStore = create<AppState>()((set, get) => {
  function scheduleSync() {
    if (!isSupabaseConfigured) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void get().sync(), 900);
  }

  return {
    ready: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    children: [],
    events: [],
    activeChildId: null,
    syncState: 'local-only',
    syncError: null,
    lastSyncAt: null,

    init: async () => {
      if (get().ready) return;
      const { children, events, childMap } = await db.dbLoadAll();
      let activeChildId = localStorage.getItem('babyapp:activeChild');
      // If the selected child's id was reassigned by the legacy-id migration,
      // follow it to the new id.
      if (activeChildId && childMap.has(activeChildId)) {
        activeChildId = childMap.get(activeChildId)!;
      }
      const live = children.filter((c) => !c.deleted);
      if (!activeChildId || !live.some((c) => c.id === activeChildId)) {
        activeChildId = live[0]?.id ?? null;
      }
      if (activeChildId) localStorage.setItem('babyapp:activeChild', activeChildId);
      set({
        children,
        events,
        activeChildId,
        ready: true,
        online: navigator.onLine,
        syncState: isSupabaseConfigured ? 'idle' : 'local-only',
      });
      if (isSupabaseConfigured && navigator.onLine) void get().sync();
    },

    setOnline: (b) => {
      set({ online: b, syncState: b ? get().syncState : 'offline' });
      if (b && isSupabaseConfigured) void get().sync();
    },

    setActiveChild: (id) => {
      set({ activeChildId: id });
      localStorage.setItem('babyapp:activeChild', id);
    },

    addChild: async (input) => {
      const now = nowIso();
      const child: Child = {
        id: uid(),
        name: input.name,
        birth_date: input.birth_date,
        birth_time: input.birth_time,
        color: input.color,
        created_at: now,
        updated_at: now,
      };
      await db.dbPutChild(child);
      set((s) => ({
        children: [child, ...s.children],
        activeChildId: child.id,
      }));
      localStorage.setItem('babyapp:activeChild', child.id);
      scheduleSync();
      return child;
    },

    updateChild: async (child) => {
      const updated = { ...child, updated_at: nowIso() };
      await db.dbPutChild(updated);
      set((s) => ({
        children: s.children.map((c) => (c.id === updated.id ? updated : c)),
      }));
      scheduleSync();
    },

    removeChild: async (id) => {
      const now = nowIso();
      const child = get().children.find((c) => c.id === id);
      if (!child) return;
      const softChild: Child = { ...child, deleted: true, updated_at: now };
      await db.dbPutChild(softChild);
      const softEvents = get().events
        .filter((e) => e.child_id === id && !e.deleted)
        .map((e) => ({ ...e, deleted: true, updated_at: now }));
      for (const e of softEvents) await db.dbPutEvent(e);
      set((s) => ({
        children: s.children.map((c) => (c.id === id ? softChild : c)),
        events: s.events.map((e) =>
          e.child_id === id && !e.deleted ? { ...e, deleted: true, updated_at: now } : e,
        ),
        activeChildId:
          s.activeChildId === id
            ? s.children.find((c) => c.id !== id && !c.deleted)?.id ?? null
            : s.activeChildId,
      }));
      scheduleSync();
    },

    addEvent: async (input) => {
      const now = nowIso();
      const evt: CareEvent = {
        id: uid(),
        start_time: now,
        created_at: now,
        updated_at: now,
        ...input,
      } as CareEvent;
      const child = get().children.find((c) => c.id === evt.child_id);
      if (child?.care_group_id) evt.care_group_id = child.care_group_id;
      await db.dbPutEvent(evt);
      set((s) => ({ events: [evt, ...s.events] }));
      scheduleSync();
      return evt;
    },

    updateEvent: async (evt) => {
      const updated = { ...evt, updated_at: nowIso() };
      await db.dbPutEvent(updated);
      set((s) => ({ events: s.events.map((e) => (e.id === updated.id ? updated : e)) }));
      scheduleSync();
    },

    removeEvent: async (id) => {
      const now = nowIso();
      const evt = get().events.find((e) => e.id === id);
      if (!evt) return;
      const soft: CareEvent = { ...evt, deleted: true, updated_at: now };
      await db.dbPutEvent(soft);
      set((s) => ({ events: s.events.map((e) => (e.id === id ? soft : e)) }));
      scheduleSync();
    },

    importEvents: async (childId, partials) => {
      const child = get().children.find((c) => c.id === childId && !c.deleted);
      if (!child) return { added: 0, skipped: 0 };

      // Dedupe against what this child already has (and within the file
      // itself), so re-importing the same export is a no-op.
      const key = (e: Partial<CareEvent>) =>
        `${e.type}|${e.start_time}|${e.end_time ?? ''}`;
      const seen = new Set(
        get()
          .events.filter((e) => e.child_id === childId && !e.deleted)
          .map(key),
      );

      const now = nowIso();
      const fresh: CareEvent[] = [];
      let skipped = 0;
      for (const p of partials) {
        if (!p.type || !p.start_time) continue;
        if (seen.has(key(p))) {
          skipped++;
          continue;
        }
        seen.add(key(p));
        fresh.push({
          id: uid(),
          child_id: childId,
          care_group_id: child.care_group_id,
          created_at: now,
          updated_at: now,
          ...p,
        } as CareEvent);
      }

      if (fresh.length) {
        await db.dbPutEvents(fresh);
        set((s) => ({ events: [...fresh, ...s.events] }));
      }
      if (fresh.length || skipped) scheduleSync();
      return { added: fresh.length, skipped };
    },

    deleteAccount: async () => {
      const { children } = get();
      await db.dbClearAll();
      set({ children: [], events: [], activeChildId: null });
      localStorage.removeItem('babyapp:activeChild');
      const sb = getSupabase();
      if (sb) {
        const groupId = children.find((c) => c.care_group_id)?.care_group_id;
        if (groupId) {
          await sb.from('care_events').delete().eq('care_group_id', groupId);
          await sb.from('children').delete().eq('care_group_id', groupId);
        }
        await sb.auth.signOut();
      }
    },

    sync: async () => {
      const sb = getSupabase();
      if (!sb) {
        set({ syncState: 'local-only' });
        return;
      }
      if (!navigator.onLine) {
        set({ syncState: 'offline', syncError: 'Offline' });
        return;
      }
      set({ syncState: 'syncing', syncError: null });
      try {
        const { data } = await sb.auth.getUser();
        if (!data.user) {
          set({ syncState: 'error', syncError: 'Sign in to sync across devices' });
          return;
        }
        const groupId = await ensureCareGroup(sb);
        if (!groupId) throw new Error('Could not resolve a care group');

        const { children, events } = get();
        const stampedChildren = children.map((c) =>
          c.care_group_id ? c : { ...c, care_group_id: groupId },
        );
        const stampedEvents = events.map((e) =>
          e.care_group_id ? e : { ...e, care_group_id: groupId },
        );
        for (const c of stampedChildren) await db.dbPutChild(c);
        for (const e of stampedEvents) await db.dbPutEvent(e);

        await syncPush(sb, stampedChildren, stampedEvents);

        const since = readWatermark(groupId);
        const { children: rC, events: rE, watermark } = await syncPull(sb, groupId, since);
        const mergedChildren = mergeRemote(stampedChildren, rC);
        const mergedEvents = mergeRemote(stampedEvents, rE);
        for (const c of mergedChildren) await db.dbPutChild(c);
        for (const e of mergedEvents) await db.dbPutEvent(e);
        writeWatermark(groupId, watermark);

        set({
          children: mergedChildren,
          events: mergedEvents,
          syncState: 'idle',
          lastSyncAt: nowIso(),
          syncError: null,
        });
      } catch (err) {
        set({ syncState: 'error', syncError: String((err as Error).message ?? err) });
      }
    },
  };
});
