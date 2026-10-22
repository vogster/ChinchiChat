/**
 * Where this device keeps its encryption secrets: its keys, the state of every encrypted
 * conversation and the plaintext of messages it has decrypted (MLS decrypts a message once).
 * Values are plain JSON. In the browser it is IndexedDB; tests use memory.
 */
export interface E2eeStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every key that starts with `prefix` (a message's plaintext and each of its edits). */
  deletePrefix(prefix: string): Promise<void>
  /** Everything goes: keys, conversations, plaintext (signing out). */
  clear(): Promise<void>
}

export const createMemoryStore = (): E2eeStore => {
  const values = new Map<string, string>()
  return {
    get: async <T>(key: string) => {
      const raw = values.get(key)
      return raw === undefined ? undefined : (JSON.parse(raw) as T)
    },
    set: async (key, value) => {
      values.set(key, JSON.stringify(value))
    },
    delete: async (key) => {
      values.delete(key)
    },
    deletePrefix: async (prefix) => {
      for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key)
    },
    clear: async () => {
      values.clear()
    },
  }
}

const DB_NAME = 'chinchi-e2ee'
const STORE = 'kv'

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })

/** One database per signed-in user, so two accounts in one browser never mix keys. */
export const createIndexedDbStore = (userId: string): E2eeStore => {
  let opened: Promise<IDBDatabase> | null = null
  const db = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(`${DB_NAME}:${userId}`, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error ?? new Error('IndexedDB is unavailable'))
    })
    return opened
  }
  const run = async <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
    request(op((await db()).transaction(STORE, mode).objectStore(STORE)))
  return {
    get: async <T>(key: string) => (await run('readonly', (s) => s.get(key))) as T | undefined,
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key))
    },
    delete: async (key) => {
      await run('readwrite', (s) => s.delete(key))
    },
    deletePrefix: async (prefix) => {
      await run('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)))
    },
    clear: async () => {
      await run('readwrite', (s) => s.clear())
    },
  }
}
