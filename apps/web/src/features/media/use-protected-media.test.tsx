import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../../lib/api-context'
import { createFakeApi } from '../../test/fake-api'
import { MediaBaseProvider } from './media-base'
import { useProtectedMedia } from './use-protected-media'

import type { ReactNode } from 'react'

const wrapperFor = (api: ReturnType<typeof createFakeApi>, base: string | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <MediaBaseProvider base={base}>{children}</MediaBaseProvider>
      </ApiProvider>
    )
  }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useProtectedMedia', () => {
  it('hands the path straight to the browser tab, where the cookie goes along', () => {
    const api = createFakeApi()
    const { result } = renderHook(() => useProtectedMedia('/api/v1/attachments/1/cat.png'), {
      wrapper: wrapperFor(api, null),
    })
    expect(result.current).toBe('/api/v1/attachments/1/cat.png')
    expect(api.media.download).not.toHaveBeenCalled()
  })

  it('fetches the bytes with the token in the desktop and shows them from a blob, once', async () => {
    const api = createFakeApi()
    api.media.download.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cat')
    const wrapper = wrapperFor(api, 'https://chat.example.com')

    const first = renderHook(() => useProtectedMedia('/api/v1/attachments/1/cat.png'), { wrapper })
    expect(first.result.current).toBeNull()
    await waitFor(() => expect(first.result.current).toBe('blob:cat'))

    const second = renderHook(() => useProtectedMedia('/api/v1/attachments/1/cat.png'), {
      wrapper,
    })
    await waitFor(() => expect(second.result.current).toBe('blob:cat'))
    expect(api.media.download).toHaveBeenCalledTimes(1)
    expect(api.media.download).toHaveBeenCalledWith('/api/v1/attachments/1/cat.png')
  })

  it('stays empty when the bytes cannot be had', async () => {
    const api = createFakeApi()
    api.media.download.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProtectedMedia('/api/v1/attachments/2/dog.png'), {
      wrapper: wrapperFor(api, 'https://chat.example.com'),
    })
    await waitFor(() => expect(api.media.download).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
