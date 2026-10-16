/** What the desktop app remembers between launches. */
export interface DesktopSettings {
  /** The instance this installation talks to; null until the first launch picks one. */
  readonly instanceUrl: string | null
  /** The bearer session token for that instance; null when signed out. */
  readonly token: string | null
}

/** The slice of Tauri's store plugin we use (`@tauri-apps/plugin-store` `Store`). */
export interface SettingsStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
}

export const createMemorySettingsStore = (): SettingsStore => {
  const values = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => values.delete(key),
  }
}

const string = async (store: SettingsStore, key: string) => {
  const value = await store.get<unknown>(key)
  return typeof value === 'string' && value.length > 0 ? value : null
}

export const createDesktopSettings = (store: SettingsStore) => ({
  async load(): Promise<DesktopSettings> {
    return { instanceUrl: await string(store, 'instanceUrl'), token: await string(store, 'token') }
  },
  /** A session belongs to one server: choosing another forgets the token. */
  async setInstanceUrl(instanceUrl: string): Promise<void> {
    await store.set('instanceUrl', instanceUrl)
    await store.delete('token')
  },
  async setToken(token: string | null): Promise<void> {
    if (token) await store.set('token', token)
    else await store.delete('token')
  },
})

export type DesktopSettingsStore = ReturnType<typeof createDesktopSettings>
