import { useEffect } from 'react'

import { useUnreadTotal } from './use-unread-total'

const ICON = '/favicon.svg'
const ICON_UNREAD = '/favicon-unread.svg'
const COUNT_PREFIX = /^\(\d+\+?\) /

/** Puts the unread total in the tab title ("(3) Chinchi") and a dot on the tab icon. */
export const UnreadBadge = () => {
  const total = useUnreadTotal()

  useEffect(() => {
    const base = document.title.replace(COUNT_PREFIX, '')
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base}` : base
    document.querySelector('link[rel="icon"]')?.setAttribute('href', total > 0 ? ICON_UNREAD : ICON)
  }, [total])

  return null
}
