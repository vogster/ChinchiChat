import { defaultWindowIcon } from '@tauri-apps/api/app'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { exit } from '@tauri-apps/plugin-process'

export interface TrayLabels {
  readonly open: string
  readonly quit: string
}

/** Brings the main window back from the tray or from behind other windows. */
export const showMainWindow = async () => {
  const window = getCurrentWindow()
  await window.show()
  await window.unminimize()
  await window.setFocus()
}

/**
 * The tray icon with its menu, and the close button's behaviour: with `closeToTray()` true the
 * window hides instead of closing, and the tray brings it back.
 */
export const installTray = async (labels: TrayLabels, closeToTray: () => boolean) => {
  const menu = await Menu.new({
    items: [
      { id: 'open', text: labels.open, action: () => void showMainWindow() },
      { id: 'quit', text: labels.quit, action: () => void exit(0) },
    ],
  })
  const icon = await defaultWindowIcon()
  await TrayIcon.new({
    id: 'chinchi',
    tooltip: 'Chinchi',
    menu,
    showMenuOnLeftClick: false,
    ...(icon ? { icon } : {}),
    action: (event) => {
      if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
        void showMainWindow()
      }
    },
  })
  await getCurrentWindow().onCloseRequested((event) => {
    if (!closeToTray()) return
    event.preventDefault()
    void getCurrentWindow().hide()
  })
}
