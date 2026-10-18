import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser, Page } from '@playwright/test'

const WIDE = { width: 1280, height: 800 }

/** Chromium's fake camera and microphone (see launch flags in the config) stand in for devices. */
const openAs = async (browser: Browser) => {
  const context = await browser.newContext({
    viewport: WIDE,
    permissions: ['microphone', 'camera'],
  })
  return { context, page: await context.newPage() }
}

const voiceChannel = (page: Page) => page.getByRole('button', { name: 'Голосовой канал Общий' })
const inVoice = (page: Page) => page.getByRole('list', { name: 'В канале Общий' })

test('two people talk in a voice channel and see each other on camera', async ({ browser }) => {
  const owner = await openAs(browser)
  const friend = await openAs(browser)
  const ownerUser = newUser()
  const friendUser = newUser()

  await registerAndOpenHome(owner.page, ownerUser)
  const invite = await createServerWithInvite(owner.page, `Голос ${ownerUser.username}`)
  await registerAndOpenHome(friend.page, friendUser)
  await acceptInvite(friend.page, invite)

  // Both join; LiveKit reports them through webhooks and everyone sees who is inside.
  await voiceChannel(owner.page).click()
  await expect(owner.page.getByRole('region', { name: 'Голосовое подключение' })).toContainText(
    'В голосовом',
  )
  await voiceChannel(friend.page).click()
  for (const { page } of [owner, friend]) {
    // The sidebar card stacks faces; unfolded, it lists names.
    await page.getByRole('button', { name: 'Показать участников Общий' }).click()
    await expect(inVoice(page)).toContainText(ownerUser.username)
    await expect(inVoice(page)).toContainText(friendUser.username)
  }

  // Muting shows up for the other side.
  await owner.page.getByRole('button', { name: 'Выключить микрофон' }).click()
  await expect(
    inVoice(friend.page).getByRole('listitem', {
      name: new RegExp(`^${ownerUser.username} \\(.*микрофон выключен`),
    }),
  ).toBeVisible()

  // The owner's camera reaches the friend's stage as video.
  const dock = owner.page.getByRole('region', { name: 'Управление звонком' })
  await dock.getByRole('button', { name: 'Камера' }).click()
  const ownerTile = friend.page
    .getByRole('list', { name: 'Участники звонка' })
    .getByRole('listitem', { name: new RegExp(`^${ownerUser.username}`) })
  await expect(ownerTile.locator('video')).toBeVisible()

  // Hanging up removes the owner from the list for both.
  await dock.getByRole('button', { name: 'Отключиться' }).click()
  await expect(inVoice(friend.page)).not.toContainText(ownerUser.username)

  await owner.context.close()
  await friend.context.close()
})
