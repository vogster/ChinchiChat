import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser } from '@playwright/test'

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  return { context, page: await context.newPage() }
}

test('two people talk in an encrypted conversation the server cannot read', async ({ browser }) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()

  await registerAndOpenHome(alice.page, aliceUser)
  const invite = await createServerWithInvite(alice.page, `Шифр ${aliceUser.username}`)
  await registerAndOpenHome(bob.page, bobUser)
  await acceptInvite(bob.page, invite)
  // Bob's browser became an encryption device when it opened the app.
  await expect
    .poll(() =>
      bob.page.evaluate(async () => {
        const response = await fetch('/api/v1/users/@me/devices')
        return ((await response.json()) as { data: { devices: unknown[] } }).data.devices.length
      }),
    )
    .toBe(1)

  // Alice starts an encrypted conversation from Bob's card.
  const members = alice.page.getByRole('complementary', { name: /Участники/ })
  await members.getByRole('button', { name: new RegExp(`^${bobUser.username},`) }).click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()

  const aliceComposer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await aliceComposer.fill('Пароль от сейфа: 4242')
  await aliceComposer.press('Enter')

  // Bob opens it from his DM list and reads the decrypted text.
  await bob.page.goto('/')
  await bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: new RegExp(`^${aliceUser.username}.*зашифрованная беседа`) })
    .click()
  await expect(bob.page.getByText('Пароль от сейфа: 4242')).toBeVisible()

  const bobComposer = bob.page.getByRole('textbox', { name: `Написать @${aliceUser.username}` })
  await bobComposer.fill('Принято, сожгу после прочтения')
  await bobComposer.press('Enter')
  await expect(alice.page.getByText('Принято, сожгу после прочтения')).toBeVisible()

  // What the server stores is ciphertext: the API never returns the text.
  const channelId = alice.page.url().split('/').at(-1) as string
  const stored = await alice.page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/channels/${id}/messages`)
    return JSON.stringify(await response.json())
  }, channelId)
  expect(stored).not.toContain('4242')
  expect(stored).toContain('"ciphertext"')

  await alice.context.close()
  await bob.context.close()
})
