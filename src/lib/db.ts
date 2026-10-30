import { openDB, type IDBPDatabase } from 'idb';
import type { Child, CareEvent } from './types';
import { uid } from './utils';

/**
 * Local-first persistence. IndexedDB is the source of truth on-device; the
 * sync module (see sync.ts) mirrors it to Supabase when configured.
 */
const DB_NAME = 'babyapp';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const children = db.createObjectStore('children', { keyPath: 'id' });
        children.createIndex('by_updated', 'updated_at');

        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('by_child_time', ['child_id', 'start_time']);
        events.createIndex('by_updated', 'updated_at');
      },
    });
  }
  return dbPromise;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

/**
 * One-time repair for rows created before `uid()` guaranteed a valid UUID.
 *
 * In non-secure contexts (plain HTTP, e.g. the app on a LAN IP) the old
 * `uid()` fell back to `id-<ts>-<rand>`, which Postgres rejects as a `uuid`.
 * Any such child/event is reassigned a valid v4 UUID, and every event's
 * `child_id` is rewritten to follow its child. Runs on every load but is a
 * no-op once everything is already a UUID.
 */
async function migrateLegacyIds(
  children: Child[],
  events: CareEvent[],
): Promise<{
  children: Child[];
  events: CareEvent[];
  changed: boolean;
  childMap: Map<string, string>;
}> {
  const childMap = new Map<string, string>();
  for (const c of children) if (!isUuid(c.id)) childMap.set(c.id, uid());

  const newChildren = children.map((c) => {
    const id = childMap.get(c.id) ?? c.id;
    return id === c.id ? c : { ...c, id };
  });

  let changed = childMap.size > 0;
  const oldEventIds: string[] = [];
  const newEvents = events.map((e) => {
    let next = e;
    const childId = childMap.get(e.child_id);
    if (childId && childId !== e.child_id) {
      next = { ...next, child_id: childId };
      changed = true;
    }
    if (!isUuid(next.id)) {
      oldEventIds.push(next.id);
      next = { ...next, id: uid() };
      changed = true;
    }
    return next;
  });

  if (changed) {
    // Put the re-keyed rows, then delete the old keys — IndexedDB `put` does
    // not move a record, so the legacy rows must be removed explicitly.
    const db = await getDB();
    for (const c of newChildren) await db.put('children', c);
    for (const e of newEvents) await db.put('events', e);
    for (const oldId of childMap.keys()) await db.delete('children', oldId);
    for (const oldId of oldEventIds) await db.delete('events', oldId);
  }
  return { children: newChildren, events: newEvents, changed, childMap };
}

export async function dbLoadAll(): Promise<{
  children: Child[];
  events: CareEvent[];
  childMap: Map<string, string>;
}> {
  const db = await getDB();
  const [children, events] = await Promise.all([db.getAll('children'), db.getAll('events')]);
  const { children: c, events: e, childMap } = await migrateLegacyIds(
    (children as Child[]) ?? [],
    (events as CareEvent[]) ?? [],
  );
  return { children: c, events: e, childMap };
}

export async function dbPutChild(child: Child): Promise<void> {
  const db = await getDB();
  await db.put('children', child);
}

export async function dbPutEvent(evt: CareEvent): Promise<void> {
  const db = await getDB();
  await db.put('events', evt);
}

export async function dbDeleteChild(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('children', id);
}

export async function dbDeleteEvent(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('events', id);
}

export async function dbClearAll(): Promise<void> {
  const db = await getDB();
  await Promise.all([db.clear('children'), db.clear('events')]);
}
