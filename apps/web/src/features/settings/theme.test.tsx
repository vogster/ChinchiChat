import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { applyStoredTheme } from '../../lib/theme'
import { createFakeApi, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

afterEach(() => {
  localStorage.clear()
  const { dataset } = document.documentElement
  delete dataset.theme
  delete dataset.palette
  delete dataset.density
})

const openAppearance = () =>
  renderApp('/settings/appearance', { api: createFakeApi({ user: testUser }) })

describe('theme', () => {
  it('follows the system until the user picks one, and remembers the choice', async () => {
    const { user } = openAppearance()

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

  it('uses the chinchilla palette until another one is picked, and remembers it', async () => {
    const { user } = openAppearance()

    expect(await screen.findByRole('radio', { name: 'Шиншилла' })).toBeChecked()
    expect(document.documentElement.dataset.palette).toBeUndefined()

    await user.click(screen.getByRole('radio', { name: 'Неон' }))
    expect(document.documentElement.dataset.palette).toBe('neon')

    delete document.documentElement.dataset.palette
    applyStoredTheme()
    expect(document.documentElement.dataset.palette).toBe('neon')

    await user.click(screen.getByRole('radio', { name: 'Шиншилла' }))
    expect(document.documentElement.dataset.palette).toBeUndefined()
  })

  it('switches the message density between cozy and compact', async () => {
    const { user } = openAppearance()

    expect(await screen.findByRole('radio', { name: 'Уютно' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Компактно' }))
    expect(document.documentElement.dataset.density).toBe('compact')

    delete document.documentElement.dataset.density
    applyStoredTheme()
    expect(document.documentElement.dataset.density).toBe('compact')

    await user.click(screen.getByRole('radio', { name: 'Уютно' }))
    expect(document.documentElement.dataset.density).toBeUndefined()
  })

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('chinchi.palette', 'sepia')
    localStorage.setItem('chinchi.density', 'huge')
    applyStoredTheme()
    expect(document.documentElement.dataset.palette).toBeUndefined()
    expect(document.documentElement.dataset.density).toBeUndefined()
  })
})
