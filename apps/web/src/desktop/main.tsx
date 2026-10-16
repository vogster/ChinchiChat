import '../styles.css'

import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { relaunch } from '@tauri-apps/plugin-process'
import { load } from '@tauri-apps/plugin-store'
import { check } from '@tauri-apps/plugin-updater'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initI18n } from '../lib/i18n'
import { applyStoredTheme } from '../lib/theme'
import { DesktopApp } from './desktop-app'
import { createDesktopSettings } from './settings'
import { mirrorUnreadBadge } from './shell'
import { createTauriShell, loadShellPreferences } from './tauri-shell'
import { installTray } from './tray'
import { checkForUpdate } from './updater'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

applyStoredTheme()
const i18n = initI18n()
mirrorUnreadBadge((count) => getCurrentWindow().setBadgeCount(count))

const boot = async () => {
  const store = await load('settings.json', { autoSave: true, defaults: {} })
  const settings = createDesktopSettings(store)
  const [initial, version] = await Promise.all([settings.load(), getVersion()])
  let preferences = await loadShellPreferences(store)
  await installTray(
    { open: i18n.t('desktop.tray.open'), quit: i18n.t('desktop.tray.quit') },
    () => preferences.closeToTray,
  )

  // A moment after the window is up, in release builds only (dev builds have no signature).
  if (import.meta.env.PROD) {
    setTimeout(() => {
      void checkForUpdate({
        check,
        relaunch,
        confirm: async (next, notes) =>
          window.confirm(
            i18n.t('desktop.update.prompt', { version: next }) +
              (notes
                ? `

${notes}`
                : ''),
          ),
      })
    }, 5_000)
  }

  createRoot(rootElement).render(
    <StrictMode>
      <DesktopApp
        settings={settings}
        initial={initial}
        fetch={tauriFetch}
        shell={(actions) =>
          createTauriShell({
            store,
            version,
            onChangeInstance: actions.changeInstance,
            onPreferences: (next) => {
              preferences = next
            },
          })
        }
      />
    </StrictMode>,
  )
}

/** A failed start shows its reason instead of a blank window. */
boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  rootElement.textContent = `Chinchi could not start: ${message}`
  rootElement.className = 'whitespace-pre-wrap p-6 font-mono text-sm text-red-400'
})
