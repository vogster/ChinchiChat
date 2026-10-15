import { expect, test } from '@playwright/test'

import { fillRegistration, registerAndOpenHome } from '../support/auth'
import { newUser } from '../support/users'

test('create a server, invite a friend, friend registers and joins', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const friendContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const friend = await friendContext.newPage()
  const ownerUser = newUser()
  const friendUser = newUser()
  const serverName = `Сервер ${ownerUser.username}`

  // Owner creates a server and lands in its first text channel.
  await registerAndOpenHome(owner, ownerUser)
  await owner.getByRole('button', { name: 'Добавить сервер' }).click()
  const createDialog = owner.getByRole('dialog', { name: 'Создайте свой сервер' })
  await createDialog.getByLabel('Название сервера').fill(serverName)
  await createDialog.getByRole('button', { name: 'Создать' }).click()
  await expect(owner.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()

  // Owner adds a channel.
  await owner.getByRole('button', { name: 'Создать канал в категории Текстовые каналы' }).click()
  const channelDialog = owner.getByRole('dialog', { name: 'Создать канал' })
  await channelDialog.getByLabel('Название канала').fill('Новости Клуба')
  await channelDialog.getByRole('button', { name: 'Создать' }).click()
  await expect(owner.getByRole('heading', { name: 'новости-клуба', level: 1 })).toBeVisible()

  // Owner creates an invite link.
  await owner.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await owner.getByRole('menuitem', { name: 'Пригласить людей' }).click()
  const link = owner.getByLabel('Ссылка-приглашение')
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9]{8}$/)
  const inviteUrl = await link.inputValue()
  await owner.keyboard.press('Escape')

  // A friend without an account opens the link, registers and comes back to accept.
  await friend.goto(inviteUrl)
  await expect(friend.getByRole('heading', { name: serverName })).toBeVisible()
  await expect(
    friend.getByText(`${ownerUser.username} приглашает вас присоединиться`),
  ).toBeVisible()
  await friend.getByRole('link', { name: 'Создать учётную запись' }).click()
  await fillRegistration(friend, friendUser)
  await friend.getByRole('button', { name: 'Принять приглашение' }).click()

  await expect(friend.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()
  await expect(friend.getByRole('link', { name: 'новости-клуба' })).toBeVisible()
  await expect(
    friend.getByRole('navigation', { name: 'Серверы' }).getByRole('link', { name: serverName }),
  ).toBeVisible()

  // The friend is a regular member: no management actions.
  await friend.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await expect(friend.getByRole('menuitem', { name: 'Настройки сервера' })).toHaveCount(0)
  await expect(friend.getByRole('menuitem', { name: 'Покинуть сервер' })).toBeVisible()
  await friend.keyboard.press('Escape')

  // The owner sees the new member (member list is shown on wide screens).
  await owner.setViewportSize({ width: 1280, height: 800 })
  await owner.reload()
  await expect(owner.getByRole('complementary', { name: 'Участники — 2' })).toContainText(
    friendUser.username,
  )

  await ownerContext.close()
  await friendContext.close()
})

test('a member can leave a server', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const member = await memberContext.newPage()
  const ownerUser = newUser()
  const serverName = `Уход ${ownerUser.username}`

  await registerAndOpenHome(owner, ownerUser)
  await owner.getByRole('button', { name: 'Добавить сервер' }).click()
  const createDialog = owner.getByRole('dialog', { name: 'Создайте свой сервер' })
  await createDialog.getByLabel('Название сервера').fill(serverName)
  await createDialog.getByRole('button', { name: 'Создать' }).click()
  await owner.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await owner.getByRole('menuitem', { name: 'Пригласить людей' }).click()
  await expect(owner.getByLabel('Ссылка-приглашение')).toHaveValue(/\/invite\//)
  const inviteUrl = await owner.getByLabel('Ссылка-приглашение').inputValue()

  await registerAndOpenHome(member, newUser())
  await member.goto(inviteUrl)
  await member.getByRole('button', { name: 'Принять приглашение' }).click()
  await expect(member.getByRole('heading', { name: 'общий', level: 1 })).toBeVisible()

  await member.getByRole('button', { name: `Меню сервера ${serverName}` }).click()
  await member.getByRole('menuitem', { name: 'Покинуть сервер' }).click()
  await member.getByRole('dialog').getByRole('button', { name: 'Покинуть сервер' }).click()

  await expect(member).toHaveURL(/\/$/)
  await expect(member.getByRole('link', { name: serverName })).toHaveCount(0)

  await ownerContext.close()
  await memberContext.close()
})
