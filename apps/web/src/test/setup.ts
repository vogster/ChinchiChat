import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom gaps that Radix primitives (menus, dialogs) rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined

// Tests render the whole app (router, queries); with the whole monorepo testing in parallel the
// default 1s for findBy*/waitFor is too tight and fails at random.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
})
