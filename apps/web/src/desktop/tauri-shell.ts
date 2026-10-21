import { getCurrentWindow } from '@tauri-apps/api/window'
import * as autostart from '@tauri-apps/plugin-autostart'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'

import { DEFAULT_SHELL_PREFERENCES } from '../features/shell/shell'

import type { Shell, ShellPreferences, ShellWindow } from '../features/shell/shell'
import type { SettingsStore } from './settings'

const PREFERENCES_KEY = 'preferences'

export interface TauriShellOptions {
  readonly store: SettingsStore
  readonly version: string
  readonly onChangeInstance: () => Promise<void>
  /** The desktop app reacts to a change (the tray honours closeToTray). */
  readonly onPreferences?: (preferences: ShellPreferences) => void
}

/** The webview says which OS it runs on; no plugin needed for that. */
export const platformOf = (userAgent = navigator.userAgent): Shell['platform'] =>
  /Mac OS X|Macintosh/.test(userAgent) ? 'macos' : /Windows/.test(userAgent) ? 'windows' : 'linux'

/** Reads the preferences without a Shell at hand (the tray needs them before React renders). */
export const loadShellPreferences = async (store: SettingsStore): Promise<ShellPreferences> => ({
  ...DEFAULT_SHELL_PREFERENCES,
  ...((await store.get<Partial<ShellPreferences>>(PREFERENCES_KEY)) ?? {}),
})

/** The main window, as the title bar needs it. */
const createTauriWindow = (): ShellWindow => {
  const current = getCurrentWindow()
  return {
    minimize: () => current.minimize(),
    toggleMaximize: () => current.toggleMaximize(),
    close: () => current.close(),
    isMaximized: () => current.isMaximized(),
    onMaximizedChange: (listener) =>
      current.onResized(() => {
        void current.isMaximized().then(listener)
      }),
  }
}

/** The Shell the web app sees in the Tauri desktop app. */
export const createTauriShell = ({
  store,
  version,
  onChangeInstance,
  onPreferences,
}: TauriShellOptions): Shell => ({
  platform: platformOf(),
  version,
  preferences: {
    load: () => loadShellPreferences(store),
    save: async (preferences) => {
      await store.set(PREFERENCES_KEY, preferences)
      onPreferences?.(preferences)
    },
  },
  autostart: {
    isEnabled: () => autostart.isEnabled(),
    set: (enabled) => (enabled ? autostart.enable() : autostart.disable()),
  },
  bindPushToTalk: async (shortcut, onChange) => {
    await register(shortcut, (event) => onChange(event.state === 'Pressed'))
    return () => unregister(shortcut)
  },
  changeInstance: onChangeInstance,
  window: createTauriWindow(),
})
