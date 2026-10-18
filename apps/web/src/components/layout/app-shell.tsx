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
      {/* Floating panels: every column is its own rounded card over the rail colour. */}
      <div className="flex h-full flex-col gap-2.5 overflow-hidden bg-rail md:p-2.5">
        {gateway.state === 'reconnecting' ? (
          <div
            role="status"
            className="shrink-0 rounded-full bg-warning-soft px-4 py-1.5 text-center text-[12.5px] font-medium text-warning-text"
          >
            {t('messages.reconnecting')}
          </div>
        ) : null}
        <VerifyEmailBanner />
        <IncomingCalls />
        <div className="relative flex min-h-0 flex-1 md:gap-2.5">
          {menuOpen ? (
            <button
              type="button"
              aria-label={t('nav.closeMenu')}
              onClick={shell.closeMenu}
              className="fixed inset-0 z-30 bg-[rgb(8_8_16/0.5)] backdrop-blur-[3px] md:hidden"
            />
          ) : null}
          <div
            data-testid="navigation-drawer"
            data-open={menuOpen}
            className="fixed inset-y-0 left-0 z-40 flex -translate-x-full gap-2.5 bg-rail p-2.5 transition-transform duration-200 data-[open=true]:translate-x-0 md:static md:translate-x-0 md:p-0"
          >
            <ServerRail />
            <ChannelSidebar />
          </div>
          {/* A row of cards: the page's MainCard and its side panels. */}
          <main className="flex min-h-0 min-w-0 flex-1 gap-2.5">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  )
}
