import { describe, expect, it } from 'vitest'

interface TauriConfig {
  readonly app?: { readonly windows?: readonly { readonly dragDropEnabled?: boolean }[] }
}

/** tauri.conf.json and the per-platform files merged over it (they replace `windows` whole). */
const configs = Object.entries(
  import.meta.glob<TauriConfig>('../../../desktop/src-tauri/tauri*.conf.json', {
    eager: true,
    import: 'default',
  }),
).map(([path, config]) => ({ name: path.split('/').at(-1) ?? path, config }))

describe('desktop window config', () => {
  it('is read from tauri.conf.json and its platform files', () => {
    expect(configs.map((entry) => entry.name)).toContain('tauri.conf.json')
  })

  // With Tauri's own file drop on, the webview gets no HTML5 drag and drop at all on Windows:
  // files can't be dropped into a chat and channels or roles can't be dragged into order.
  it.each(configs.filter((entry) => entry.config.app?.windows))(
    'leaves drag and drop to the page in $name',
    ({ config }) => {
      for (const window of config.app?.windows ?? []) expect(window.dragDropEnabled).toBe(false)
    },
  )
})
