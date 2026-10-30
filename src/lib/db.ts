import { openDB, type IDBPDatabase } from 'idb';
import type { Child, CareEvent } from './types';

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

export async function dbLoadAll(): Promise<{ children: Child[]; events: CareEvent[] }> {
  const db = await getDB();
  const [children, events] = await Promise.all([db.getAll('children'), db.getAll('events')]);
  return {
    children: (children as Child[]) ?? [],
    events: (events as CareEvent[]) ?? [],
  };
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
