import { expect } from '@playwright/test'

import type { Page } from '@playwright/test'

/** A asks B by username, B asks back, which accepts: they are friends (through the API). */
export const befriend = async (a: Page, b: Page, aName: string, bName: string) => {
  const ask = (page: Page, username: string) =>
    page.evaluate(async (name) => {
      const response = await fetch('/api/v1/users/@me/relationships', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: name }),
      })
      return response.status
    }, username)
  expect(await ask(a, bName)).toBeLessThan(300)
  expect(await ask(b, aName)).toBeLessThan(300)
}
