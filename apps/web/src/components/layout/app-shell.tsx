import { useLocation } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { VerifyEmailBanner } from '../../features/auth/verify-email-banner'
import { useGateway } from '../../features/realtime/gateway-context'
import { IncomingCalls } from '../../features/voice/incoming-calls'
import { ChannelSidebar } from './channel-sidebar'
import { ServerRail } from './server-rail'
import { ShellContext } from './shell-context'

import type { ReactNode } from 'react'

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const gateway = useGateway()
  // The drawer belongs to the page it was opened on, so navigating away closes it
  // without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const menuOpen = openedOn === pathname

  const shell = useMemo(
    () => ({
      menuOpen,
      openMenu: () => setOpenedOn(pathname),
      closeMenu: () => setOpenedOn(null),
    }),
    [menuOpen, pathname],
  )

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-full flex-col overflow-hidden">
        {gateway.state === 'reconnecting' ? (
          <div
            role="status"
            className="bg-yellow-500 px-4 py-1 text-center text-sm font-medium text-black"
          >
            {t('messages.reconnecting')}
          </div>
        ) : null}
        <VerifyEmailBanner />
        <IncomingCalls />
        <div className="relative flex min-h-0 flex-1">
          {menuOpen ? (
            <button
              type="button"
              aria-label={t('nav.closeMenu')}
              onClick={shell.closeMenu}
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
            />
          ) : null}
          <div
            data-testid="navigation-drawer"
            data-open={menuOpen}
            className="fixed inset-y-0 left-0 z-40 flex -translate-x-full transition-transform duration-200 data-[open=true]:translate-x-0 md:static md:translate-x-0"
          >
            <ServerRail />
            <ChannelSidebar />
          </div>
          <main className="flex min-w-0 flex-1 flex-col bg-main">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  )
}
