/**
 * Minimal promise wrapper over IndexedDB for ChessBuddy's game library.
 * Stores:
 *  - `reviews` (key = review key) → full GameReview
 *  - `games`   (keyPath `key`)    → GameRecord summaries for the dashboard
 *  - `puzzles` (keyPath `id`)     → puzzles generated from your mistakes
 */
export type StoreName = 'reviews' | 'games' | 'puzzles';

const DB_NAME = 'chessbuddy';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews');
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('puzzles')) {
        const puzzles = db.createObjectStore('puzzles', { keyPath: 'id' });
        puzzles.createIndex('gameKey', 'gameKey');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the game library'));
    req.onblocked = () => reject(new Error('The game library is open in an older tab; close it and reload.'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function dbGetAllByIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).index(index).getAll(value)) as Promise<T[]>;
}

/** One write transaction: puts (value, optional out-of-line key) and deletes. */
export async function dbWrite(
  ops: { store: StoreName; put?: unknown; key?: IDBValidKey; delete?: IDBValidKey }[],
): Promise<void> {
  if (!ops.length) return;
  const db = await openDb();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const op of ops) {
    const s = tx.objectStore(op.store);
    if (op.delete !== undefined) s.delete(op.delete);
    else if (op.key !== undefined) s.put(op.put, op.key);
    else s.put(op.put);
  }
  await done(tx);
}

/** For tests: forget the cached connection. */
export function resetDbConnection(): void {
  dbPromise?.then((db) => db.close()).catch(() => {});
  dbPromise = null;
}
