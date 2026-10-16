import { describe, expect, it, vi } from 'vitest'

import { checkForUpdate } from './updater'

const update = (version = '0.16.0') => ({
  version,
  body: 'What is new',
  downloadAndInstall: vi.fn(async () => undefined),
})

describe('checkForUpdate', () => {
  it('installs and relaunches once the person agrees', async () => {
    const available = update()
    const relaunch = vi.fn(async () => undefined)
    const confirm = vi.fn(async () => true)

    const outcome = await checkForUpdate({ check: async () => available, relaunch, confirm })

    expect(outcome).toBe('installed')
    expect(confirm).toHaveBeenCalledWith('0.16.0', 'What is new')
    expect(available.downloadAndInstall).toHaveBeenCalled()
    expect(relaunch).toHaveBeenCalled()
  })

  it('leaves the app alone when there is nothing new or the person declines', async () => {
    const relaunch = vi.fn(async () => undefined)
    expect(
      await checkForUpdate({ check: async () => null, relaunch, confirm: async () => true }),
    ).toBe('none')

    const declined = update()
    expect(
      await checkForUpdate({ check: async () => declined, relaunch, confirm: async () => false }),
    ).toBe('declined')
    expect(declined.downloadAndInstall).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
  })

  it('swallows failures: offline or a bad signature is a problem for the next launch', async () => {
    const onError = vi.fn()
    const outcome = await checkForUpdate({
      check: async () => {
        throw new Error('signature does not verify')
      },
      relaunch: async () => undefined,
      confirm: async () => true,
      onError,
    })
    expect(outcome).toBe('none')
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})
