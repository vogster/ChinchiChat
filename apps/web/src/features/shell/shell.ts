/** What the desktop app remembers about how it should behave (kept by the shell, not the server). */
export interface ShellPreferences {
  /** Closing the window hides it to the tray instead of quitting. */
  readonly closeToTray: boolean
  /** A global shortcut that unmutes the microphone while held, or null for none. */
  readonly pushToTalk: string | null
}

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = { closeToTray: true, pushToTalk: null }

/**
 * What a desktop shell offers the web app beyond a browser tab. Absent in the browser; the
 * Tauri app provides it, tests a fake.
 */
export interface Shell {
  readonly platform: 'windows' | 'macos' | 'linux'
  readonly version: string
  readonly preferences: {
    load(): Promise<ShellPreferences>
    save(preferences: ShellPreferences): Promise<void>
  }
  readonly autostart: {
    isEnabled(): Promise<boolean>
    set(enabled: boolean): Promise<void>
  }
  /**
   * Binds a global shortcut (`Ctrl+Shift+V`): `onChange(true)` when it goes down, `false` when it
   * comes up. Resolves to the unbind; rejects when the shortcut cannot be taken.
   */
  readonly bindPushToTalk: (
    shortcut: string,
    onChange: (pressed: boolean) => void,
  ) => Promise<() => Promise<void>>
  /** Forgets the chosen instance and shows the picker again. */
  readonly changeInstance: () => Promise<void>
  /** The frameless window around the app: the app's own title bar drives it. */
  readonly window: ShellWindow
}

export interface ShellWindow {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  /** Asks to close: with closeToTray on, the shell hides the window instead. */
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** Calls `listener` whenever the window is maximized or restored; resolves to the unsubscribe. */
  onMaximizedChange(listener: (maximized: boolean) => void): Promise<() => void>
}
