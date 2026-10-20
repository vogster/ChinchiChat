import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { saveRecoveryKey } from '../support/encryption'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

/** Chromium's fake microphone (see launch flags in the config) is what gets recorded. */
const openAs = async (browser: Browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone'],
  })
  // Encryption's guide opens once per browser; these tests are not about it.
  await context.addInitScript(() => localStorage.setItem('chinchi.e2ee.guideSeen', '1'))
  return { context, page: await context.newPage() }
}

/** Records about two seconds from the fake microphone and sends it. */
const recordVoice = async (page: Page) => {
  await page.getByRole('button', { name: 'Записать голосовое' }).click()
  const recording = page.getByRole('group', { name: 'Запись голосового' })
  await expect(recording.getByText('0:02')).toBeVisible()
  await recording.getByRole('button', { name: 'Отправить голосовое' }).click()
  await expect(recording).toBeHidden()
}

/** A voice message's play button names its length: "0:02" or so, never "0:00". */
const PLAY = /^Воспроизвести голосовое, 0:0[1-9]$/

test('a voice message is recorded, sent and played by the other person', async ({ browser }) => {
  const owner = await openAs(browser)
  const friend = await openAs(browser)
  const ownerUser = newUser()
  await registerAndOpenHome(owner.page, ownerUser)
  const invite = await createServerWithInvite(owner.page, `Голосовые ${ownerUser.username}`)
  await registerAndOpenHome(friend.page, newUser())
  await acceptInvite(friend.page, invite)

  await recordVoice(owner.page)

  const play = friend.page.getByRole('button', { name: PLAY })
  await expect(play).toBeEnabled()
  await play.click()
  await expect(friend.page.getByRole('button', { name: 'Пауза' })).toBeVisible()
  // The server serves it as audio the player may play, not as a download.
  const position = friend.page.getByRole('slider', { name: 'Позиция в голосовом' })
  await expect(position).toHaveAttribute('aria-valuemax', /^[1-9]$/)
})

test('a voice message in an encrypted conversation plays after decryption', async ({ browser }) => {
  const alice = await openAs(browser)
  const bob = await openAs(browser)
  const aliceUser = newUser()
  const bobUser = newUser()
  await registerAndOpenHome(alice.page, aliceUser)
  const invite = await createServerWithInvite(alice.page, `Шифр ${aliceUser.username}`)
  await registerAndOpenHome(bob.page, bobUser)
  await acceptInvite(bob.page, invite)

  const members = alice.page.getByRole('complementary', { name: /Участники/ })
  await members.getByRole('button', { name: new RegExp(`^${bobUser.username},`) }).click()
  await alice.page.getByRole('button', { name: 'Зашифрованная беседа' }).click()
  await expect(alice.page.getByText('Сквозное шифрование')).toBeVisible()
  await saveRecoveryKey(alice.page)
  // Bob is in before the voice goes out, so the conversation has his device.
  const aliceComposer = alice.page.getByRole('textbox', { name: `Написать @${bobUser.username}` })
  await aliceComposer.fill('Сейчас запишу')
  await aliceComposer.press('Enter')

  await recordVoice(alice.page)
  await expect(alice.page.getByRole('button', { name: PLAY })).toBeEnabled()

  await bob.page.goto('/')
  await bob.page
    .getByRole('complementary', { name: 'Личные сообщения' })
    .getByRole('link', { name: new RegExp(`^${aliceUser.username}.*зашифрованная беседа`) })
    .click()
  await saveRecoveryKey(bob.page)
  await expect(bob.page.getByRole('button', { name: PLAY })).toBeEnabled()
})
