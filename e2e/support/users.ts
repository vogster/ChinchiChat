import { randomUUID } from 'node:crypto'

/** A fresh account per test so runs never collide, even against a shared dev database. */
export const newUser = () => {
  const id = randomUUID().replaceAll('-', '').slice(0, 12)
  return {
    username: `e2e_${id}`,
    email: `e2e_${id}@example.com`,
    password: `pw-${id}-${id}`,
  }
}
