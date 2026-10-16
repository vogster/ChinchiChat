import '../styles.css'

import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { load } from '@tauri-apps/plugin-store'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initI18n } from '../lib/i18n'
import { applyStoredTheme } from '../lib/theme'
import { DesktopApp } from './desktop-app'
import { createDesktopSettings } from './settings'
import { mirrorUnreadBadge } from './shell'
import { createTauriShell, loadShellPreferences } from './tauri-shell'
import { installTray } from './tray'

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
