import { vi } from 'vitest'

import { DEFAULT_SHELL_PREFERENCES } from '../features/shell/shell'

import type { Shell, ShellPreferences } from '../features/shell/shell'

export interface FakeShellOptions {
  readonly preferences?: Partial<ShellPreferences>
  readonly autostart?: boolean
  /** Shortcuts another program holds: binding them fails. */
  readonly taken?: readonly string[]
}

/** A desktop shell in memory: tests press the push-to-talk key and read what was saved. */
export const createFakeShell = ({
  preferences: initial = {},
  autostart = false,
  taken = [],
}: FakeShellOptions = {}) => {
  let preferences: ShellPreferences = { ...DEFAULT_SHELL_PREFERENCES, ...initial }
  let autostartEnabled = autostart
  const bound = new Map<string, (pressed: boolean) => void>()

  const shell: Shell = {
    platform: 'windows',
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
  }

  return {
    shell,
    preferences: () => preferences,
    autostart: () => autostartEnabled,
    bound: () => [...bound.keys()],
    press: (shortcut: string) => bound.get(shortcut)?.(true),
    release: (shortcut: string) => bound.get(shortcut)?.(false),
  }
}
