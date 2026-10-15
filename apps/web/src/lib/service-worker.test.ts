import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerServiceWorker } from './service-worker'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerServiceWorker', () => {
  it('registers /sw.js in production builds once the page has loaded', async () => {
    const register = vi.fn(async () => ({}))
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { register } })

    registerServiceWorker(true)
    window.dispatchEvent(new Event('load'))

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('stays out of development and browsers without service workers', () => {
    const register = vi.fn(async () => ({}))
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { register } })
    registerServiceWorker(false)
    window.dispatchEvent(new Event('load'))
    expect(register).not.toHaveBeenCalled()

    vi.stubGlobal('navigator', {})
    expect(() => registerServiceWorker(true)).not.toThrow()
  })
})
