import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testGuild, testUser } from './fake-api'
import { renderApp } from './render-app'

/**
 * Structural accessibility checks (names, roles, labels, nesting) on the main screens.
 * Colour contrast needs a real layout engine, so it is checked by eye in the browser.
 */
const audit = async () => {
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return result.violations.map((v) => ({
    rule: v.id,
    nodes: v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`).slice(0, 3),
  }))
}

const screens: { name: string; url: string; ready: () => Promise<unknown> }[] = [
  {
    name: 'sign-in',
    url: '/login',
    ready: () => screen.findByRole('heading', { name: 'С возвращением!' }),
  },
  {
    name: 'registration',
    url: '/register',
    ready: () => screen.findByRole('button', { name: 'Продолжить' }),
  },
  {
    name: 'a server channel',
    url: `/channels/${testGuild.id}/503`,
    ready: () => screen.findByText('Как дела?'),
  },
  {
    name: 'a direct message',
    url: `/channels/@me/${testDm.id}`,
    ready: () => screen.findByRole('textbox', { name: /Сообщение|@/ }),
  },
  {
    name: 'friends',
    url: '/',
    ready: () => screen.findByRole('heading', { name: 'Друзья' }),
  },
  {
    name: 'account settings',
    url: '/settings/account',
    ready: () => screen.findByRole('heading', { name: 'Моя учётная запись' }),
  },
  {
    name: 'server settings',
    url: `/server-settings/${testGuild.id}/roles`,
    ready: () => screen.findByRole('heading', { name: 'Роли' }),
  },
]

describe('accessibility', { timeout: 30_000 }, () => {
  it.each(screens)('$name has no structural problems', async ({ url, ready }) => {
    const signedIn = url !== '/login' && url !== '/register'
    renderApp(url, { api: createFakeApi({ user: signedIn ? testUser : null }) })
    await ready()

    expect(await audit()).toEqual([])
  })
})
