import { expect, test } from '@playwright/test'

import { registerAndOpenHome } from '../support/auth'
import { acceptInvite, createServerWithInvite } from '../support/guild'
import { newUser } from '../support/users'

import type { Browser } from '@playwright/test'

const openAs = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  return { context, page: await context.newPage() }
}

test('a poll is created, voted on and followed live', async ({ browser }) => {
  const owner = await openAs(browser)
  const friend = await openAs(browser)
  const ownerUser = newUser()
  const friendUser = newUser()
  await registerAndOpenHome(owner.page, ownerUser)
  const invite = await createServerWithInvite(owner.page, `Опросы ${ownerUser.username}`)
  await registerAndOpenHome(friend.page, friendUser)
  await acceptInvite(friend.page, invite)

  // The owner writes a poll from the composer.
  await owner.page.getByRole('button', { name: 'Создать опрос' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Новый опрос' })
  await dialog.getByLabel('Вопрос', { exact: true }).fill('Во что играем?')
  await dialog.getByLabel('Ответ 1', { exact: true }).fill('Шахматы')
  await dialog.getByLabel('Ответ 2', { exact: true }).fill('Го')
  await dialog.getByRole('button', { name: 'Отправить опрос' }).click()
  await expect(dialog).toBeHidden()

  // The friend sees it and votes; the owner's results move without a reload.
  const friendPoll = friend.page.getByRole('group', { name: 'Опрос: Во что играем?' })
  await friendPoll.getByRole('radio', { name: 'Го' }).click()
  await friendPoll.getByRole('button', { name: 'Проголосовать' }).click()
  await expect(
    friendPoll.getByRole('meter', { name: 'Го: 100%, 1 голос, ваш ответ' }),
  ).toBeVisible()

  const ownerPoll = owner.page.getByRole('group', { name: 'Опрос: Во что играем?' })
  await ownerPoll.getByRole('radio', { name: 'Шахматы' }).click()
  await ownerPoll.getByRole('button', { name: 'Проголосовать' }).click()
  await expect(
    ownerPoll.getByRole('meter', { name: 'Шахматы: 50%, 1 голос, ваш ответ' }),
  ).toBeVisible()
  await expect(friendPoll.getByRole('meter', { name: /^Шахматы: 50%/ })).toBeVisible()

  // The owner ends it; nobody votes any more.
  await ownerPoll.getByRole('button', { name: 'Завершить опрос' }).click()
  await expect(friendPoll).toContainText('Опрос завершён')
  await expect(friendPoll.getByRole('button', { name: 'Изменить голос' })).toBeHidden()

  await owner.context.close()
  await friend.context.close()
})
