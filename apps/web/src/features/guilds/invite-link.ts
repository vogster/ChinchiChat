const CODE = /^[A-Za-z0-9]{1,16}$/
const FROM_URL = /\/invite\/([A-Za-z0-9]{1,16})\/?(?:[?#].*)?$/

/** Accepts a full invite link (any host) or a bare code; returns the code or null. */
export const parseInviteCode = (input: string): string | null => {
  const value = input.trim()
  if (CODE.test(value)) return value
  return FROM_URL.exec(value)?.[1] ?? null
}

export const inviteUrl = (code: string, origin: string = window.location.origin): string =>
  `${origin}/invite/${code}`
