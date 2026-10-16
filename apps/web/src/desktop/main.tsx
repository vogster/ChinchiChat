import '../styles.css'

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { load } from '@tauri-apps/plugin-store'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initI18n } from '../lib/i18n'
import { applyStoredTheme } from '../lib/theme'
import { DesktopApp } from './desktop-app'
import { createDesktopSettings } from './settings'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

applyStoredTheme()
initI18n()

const boot = async () => {
  const store = await load('settings.json', { autoSave: true, defaults: {} })
  const settings = createDesktopSettings(store)
  const initial = await settings.load()
  createRoot(rootElement).render(
    <StrictMode>
      <DesktopApp settings={settings} initial={initial} fetch={tauriFetch} />
    </StrictMode>,
  )
}

void boot()
