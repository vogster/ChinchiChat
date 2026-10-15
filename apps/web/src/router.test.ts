import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createAppRouter } from './router'
import { createFakeApi } from './test/fake-api'

describe('createAppRouter', () => {
  it('uses the browser location when no history is provided', () => {
    window.history.replaceState(null, '', '/some/path?x=1')

    const router = createAppRouter({ queryClient: new QueryClient(), api: createFakeApi() })

    expect(router.history.location.pathname).toBe('/some/path')
  })
})
