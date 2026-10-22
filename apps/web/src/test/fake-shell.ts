import { vi } from 'vitest'

import { DEFAULT_SHELL_PREFERENCES } from '../features/shell/shell'

import type { Shell, ShellPreferences } from '../features/shell/shell'

export interface FakeShellOptions {
  readonly preferences?: Partial<ShellPreferences>
  readonly autostart?: boolean
  /** Shortcuts another program holds: binding them fails. */
  readonly taken?: readonly string[]
  readonly platform?: Shell['platform']
}

/** A desktop shell in memory: tests press the push-to-talk key and read what was saved. */
export const createFakeShell = ({
  preferences: initial = {},
  autostart = false,
  taken = [],
  platform = 'windows',
}: FakeShellOptions = {}) => {
  let preferences: ShellPreferences = { ...DEFAULT_SHELL_PREFERENCES, ...initial }
  let autostartEnabled = autostart
  const bound = new Map<string, (pressed: boolean) => void>()
  let maximized = false
  const saved: { name: string; blob: Blob }[] = []
  const maximizedListeners = new Set<(maximized: boolean) => void>()
  const setMaximized = (next: boolean) => {
    maximized = next
    maximizedListeners.forEach((listener) => listener(next))
  }

  const shell: Shell = {
    platform,
    version: '0.15.0-test',
    preferences: {
      load: vi.fn(async () => preferences),
      save: vi.fn(async (next: ShellPreferences) => {
        preferences = next
      }),
    },
    autostart: {
      isEnabled: vi.fn(async () => autostartEnabled),
      set: vi.fn(async (enabled: boolean) => {
        autostartEnabled = enabled
      }),
    },
    bindPushToTalk: vi.fn(async (shortcut: string, onChange: (pressed: boolean) => void) => {
      if (taken.includes(shortcut)) throw new Error(`${shortcut} is taken`)
      bound.set(shortcut, onChange)
      return async () => {
        bound.delete(shortcut)
      }
    }),
    changeInstance: vi.fn(async () => undefined),
    saveFile: vi.fn(async (name: string, blob: Blob) => {
      saved.push({ name, blob })
      return true
    }),
    window: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => setMaximized(!maximized)),
      close: vi.fn(async () => undefined),
      isMaximized: vi.fn(async () => maximized),
      onMaximizedChange: vi.fn(async (listener: (maximized: boolean) => void) => {
        maximizedListeners.add(listener)
        return () => {
          maximizedListeners.delete(listener)
        }
      }),
    },
  }

  return {
    shell,
    preferences: () => preferences,
    autostart: () => autostartEnabled,
    bound: () => [...bound.keys()],
    press: (shortcut: string) => bound.get(shortcut)?.(true),
    release: (shortcut: string) => bound.get(shortcut)?.(false),
    maximized: () => maximized,
    /** Files the user "saved" through the shell's dialog. */
    saved: () => saved,
    /** The OS maximizes or restores the window (a double-click on the title bar, Win+Up). */
    setMaximized,
  }
}
