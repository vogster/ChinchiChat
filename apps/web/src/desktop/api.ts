import { createApiClient, createGatewayClient } from '@chinchi/sdk'

import type { GatewayFactory } from '../features/realtime/gateway-factory'
import type { ApiClient, FetchLike } from '@chinchi/sdk'

export interface TokenKeeper {
  readonly get: () => string | null
  readonly set: (token: string | null) => Promise<void>
}

export interface DesktopApiOptions {
  readonly instanceUrl: string
  /** Tauri's HTTP plugin: requests leave through Rust, so the webview's origin rules don't apply. */
  readonly fetch: FetchLike
  readonly token: TokenKeeper
}

/**
 * The web app's API client pointed at a chosen instance, in bearer mode (no cookies cross
 * the webview boundary). Signing in stores the token the server hands back; signing out drops
 * it even if the server could not be told.
 */
export const createDesktopApi = ({ instanceUrl, fetch, token }: DesktopApiOptions): ApiClient => {
  const api = createApiClient({ baseUrl: `${instanceUrl}/api/v1`, fetch, getToken: token.get })

  const keeping =
    <
      A extends unknown[],
      R extends { token?: string | undefined } | { mfaTicket: string } | { state: 'pending' },
    >(
      call: (...args: A) => Promise<R>,
    ) =>
    async (...args: A): Promise<R> => {
      const result = await call(...args)
      if ('token' in result && result.token) await token.set(result.token)
      return result
    }

  return {
    ...api,
    auth: {
      ...api.auth,
      register: keeping(api.auth.register),
      login: keeping(api.auth.login),
      loginMfa: keeping(api.auth.loginMfa),
      qr: { ...api.auth.qr, claim: keeping(api.auth.qr.claim) },
      logout: async () => {
        try {
          await api.auth.logout()
        } finally {
          await token.set(null)
        }
      },
    },
  }
}

/** `wss://host/api/v1/gateway` for an https instance, `ws://` for a local http one. */
export const gatewayUrlOf = (instanceUrl: string): string =>
  `${instanceUrl.replace(/^http/, 'ws')}/api/v1/gateway`

/** The realtime connection to the chosen instance, authenticated with the stored token. */
export const createDesktopGateway =
  (instanceUrl: string, getToken: () => string | null): GatewayFactory =>
  (handlers) =>
    createGatewayClient({ url: gatewayUrlOf(instanceUrl), getToken, ...handlers })
