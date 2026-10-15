import { useParams } from '@tanstack/react-router'

import { DmSidebar } from '../../features/dms/dm-sidebar'
import { GuildSidebar } from '../../features/guilds/guild-sidebar'

/** Second column: the open server's channels, or friends and DMs on the home screen. */
export const ChannelSidebar = () => {
  const { guildId, channelId } = useParams({ strict: false })
  return guildId ? <GuildSidebar guildId={guildId} channelId={channelId} /> : <DmSidebar />
}
