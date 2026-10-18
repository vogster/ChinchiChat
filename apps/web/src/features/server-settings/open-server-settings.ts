import { redirect } from '@tanstack/react-router'

import { firstTextChannel } from '../guilds/channel-tree'
import { guildQueryOptions } from '../guilds/queries'

import type { RouterContext } from '../../routes/__root'
import type { ServerSettingsSection } from './sections'

/**
 * Old links to the full-page server settings (`/server-settings/<id>/roles`) open the settings
 * window over the server's first text channel instead.
 */
export const redirectToServerSettings = async (
  context: RouterContext,
  guildId: string,
  section: ServerSettingsSection | undefined,
): Promise<never> => {
  const search = { serverSettings: guildId, ...(section ? { serverSection: section } : {}) }
  const guild = await context.queryClient
    .ensureQueryData(guildQueryOptions(context.api, guildId))
    .catch(() => null)
  const channel = guild ? firstTextChannel(guild.channels) : undefined
  throw channel
    ? redirect({
        to: '/channels/$guildId/$channelId',
        params: { guildId, channelId: channel.id },
        search,
        replace: true,
      })
    : redirect({ to: '/channels/$guildId', params: { guildId }, search, replace: true })
}
