import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

import type { E2eeClient } from './client'

const ALICE = '1'
const BOB = '2'
const DM = { id: '500', memberIds: [ALICE, BOB] }

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name: string) =>
    createE2eeClient({
      api: delivery.apiFor(userId),
      store: createMemoryStore(),
      userId,
      deviceName: name,
    })
  /** Hands every approval change to the clients, as the gateway would, until things settle. */
  const pump = async (...clients: E2eeClient[]) => {
    let handled = 0
    while (handled < delivery.approvalEvents.length) {
      const event = delivery.approvalEvents[handled] as (typeof delivery.approvalEvents)[number]
      handled += 1
      for (const c of clients) await c.approvals.handle(event)
    }
  }
  return { delivery, client, pump }
}

describe('approving a new device from an old one', () => {
  it('shows the same emoji on both, then the new one is vouched for and reads old messages', async () => {
    const { delivery, client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    const bob = client(BOB, 'Браузер')
    await bob.ready()
    await laptop.open(DM)
    const old = await laptop.send(DM, 'До нового телефона')
    await laptop.flushBackup()
    const phone = client(ALICE, 'Телефон')
    const phoneId = await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)

    const [onLaptop] = laptop.approvals.views()
    const [onPhone] = phone.approvals.views()
    expect(onLaptop).toMatchObject({ role: 'approver', deviceName: 'Телефон', state: 'compare' })
    expect(onPhone).toMatchObject({ role: 'new', state: 'compare' })
    expect(onLaptop?.emoji).toHaveLength(4)
    expect(onLaptop?.emoji).toEqual(onPhone?.emoji)

    await laptop.approvals.confirm(onLaptop?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()[0]?.state).toBe('done')
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toEqual(
      expect.any(String),
    )
    expect(await phone.recovery.key()).toBe(await laptop.recovery.key())
    expect(await phone.read(DM, old)).toMatchObject({ text: 'До нового телефона' })
  })

  it('stops when the old device says no', async () => {
    const { delivery, client, pump } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    await laptop.ready()
    const phone = client(ALICE, 'Телефон')
    const phoneId = await phone.ready()

    await phone.approvals.request()
    await pump(laptop, phone)
    await laptop.approvals.decline(laptop.approvals.views()[0]?.approvalId as string)
    await pump(laptop, phone)

    expect(phone.approvals.views()[0]?.state).toBe('declined')
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toBeNull()
    expect(await phone.recovery.key()).toBeNull()
  })

  it('is not offered by a device that cannot vouch for anyone', async () => {
    const { client, pump } = setup()
    await client(ALICE, 'Ноутбук').ready()
    const phone = client(ALICE, 'Телефон')
    const tablet = client(ALICE, 'Планшет')
    await Promise.all([phone.ready(), tablet.ready()])

    await phone.approvals.request()
    await pump(phone, tablet)

    // The tablet is unapproved too: it holds no keys to hand over, so it shows nothing.
    expect(tablet.approvals.views()).toEqual([])
  })
})
