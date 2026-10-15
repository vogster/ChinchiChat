import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('auth guards', () => {
  it('sends guests to the login page and remembers where they were going', async () => {
    const { router } = renderApp('/')

    expect(await screen.findByRole('heading', { name: 'С возвращением!' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/' })
  })

  it('lets signed-in users into the app', async () => {
    renderApp('/', { user: testUser })

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
  })

  it.each(['/login', '/register'])('redirects signed-in users away from %s', async (path) => {
    const { router } = renderApp(path, { user: testUser })

    expect(await screen.findByRole('heading', { name: 'Друзья', level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })
})
