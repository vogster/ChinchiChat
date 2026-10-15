import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'
import { applyStoredTheme } from '../../lib/theme'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('theme', () => {
  it('follows the system until the user picks one, and remembers the choice', async () => {
    const { user } = renderApp('/settings/appearance', { api: createFakeApi({ user: testUser }) })

    const system = await screen.findByRole('radio', { name: 'Как в системе' })
    expect(system).toBeChecked()
    expect(document.documentElement.dataset.theme).toBeUndefined()

    await user.click(screen.getByRole('radio', { name: 'Светлая' }))
    expect(document.documentElement.dataset.theme).toBe('light')

    delete document.documentElement.dataset.theme
    applyStoredTheme()
    expect(document.documentElement.dataset.theme).toBe('light')

    await user.click(screen.getByRole('radio', { name: 'Как в системе' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
