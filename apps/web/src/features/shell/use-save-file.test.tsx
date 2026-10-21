import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeShell } from '../../test/fake-shell'
import { ShellProvider } from './shell-context'
import { useSaveFile } from './use-save-file'

import type { ReactNode } from 'react'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSaveFile', () => {
  it('lets the browser download the file in a tab', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = renderHook(() => useSaveFile())

    await result.current('report.pdf', new Blob(['pdf']))

    expect(click).toHaveBeenCalledOnce()
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('report.pdf')
    expect(anchor.href).toBe('blob:report')
  })

  it('asks the desktop shell where to put the file', async () => {
    const fake = createFakeShell()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = renderHook(() => useSaveFile(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ShellProvider shell={fake.shell}>{children}</ShellProvider>
      ),
    })

    await result.current('report.pdf', new Blob(['pdf'], { type: 'application/pdf' }))

    expect(fake.saved().map((file) => file.name)).toEqual(['report.pdf'])
    expect(await fake.saved()[0]?.blob.text()).toBe('pdf')
    expect(click).not.toHaveBeenCalled()
  })
})
