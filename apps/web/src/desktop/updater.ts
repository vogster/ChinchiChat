/** The slice of `@tauri-apps/plugin-updater` the check uses; a fake in tests. */
export interface AvailableUpdate {
  readonly version: string
  readonly body?: string | undefined
  downloadAndInstall(): Promise<void>
}

export interface UpdaterDeps {
  /** `check()` from the updater plugin: the update, or null when this is the latest. */
  readonly check: () => Promise<AvailableUpdate | null>
  /** `relaunch()` from the process plugin. */
  readonly relaunch: () => Promise<void>
  /** Asks whether to install now; the app keeps running on "no". */
  readonly confirm: (version: string, notes: string | undefined) => Promise<boolean>
  readonly onError?: (error: unknown) => void
}

/**
 * Looks for a newer Chinchi, asks, and installs it in place. Errors (no network, a signature
 * that does not verify, a missing release) never trouble the user: the next launch tries again.
 */
export const checkForUpdate = async ({
  check,
  relaunch,
  confirm,
  onError,
}: UpdaterDeps): Promise<'none' | 'declined' | 'installed'> => {
  try {
    const update = await check()
    if (!update) return 'none'
    if (!(await confirm(update.version, update.body))) return 'declined'
    await update.downloadAndInstall()
    await relaunch()
    return 'installed'
  } catch (error) {
    onError?.(error)
    return 'none'
  }
}
