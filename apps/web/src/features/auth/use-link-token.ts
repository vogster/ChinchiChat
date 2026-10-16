import { useLocation } from '@tanstack/react-router'

/**
 * The one-time token of an emailed link. Emails put it in the fragment (`#token=…`), which the
 * browser never sends to a server; links from older emails still carry it as a query parameter.
 */
export const useLinkToken = (fromSearch: string | undefined): string | undefined => {
  const { hash } = useLocation()
  return fromSearch ?? new URLSearchParams(hash).get('token') ?? undefined
}
