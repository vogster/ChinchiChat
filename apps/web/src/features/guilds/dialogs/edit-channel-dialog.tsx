import { Permission } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../../components/ui/dialog'
import { ChannelFollowersTab } from '../../announcements/channel-followers-tab'
import { can } from '../../permissions/permissions'
import { useGuildPermissions } from '../../permissions/use-guild-permissions'
import { ChannelWebhooksTab } from '../../webhooks/channel-webhooks-tab'
import { ChannelOverviewTab } from './channel-overview-tab'
import { ChannelPermissionsTab } from './channel-permissions-tab'

import type { Channel, GuildDetail } from '@chinchi/shared'

export interface EditChannelDialogProps {
  readonly guild: GuildDetail
  readonly channel: Channel
  readonly onOpenChange: (open: boolean) => void
}

type Tab = 'overview' | 'permissions' | 'webhooks' | 'followers'

/** Channel settings: overview (MANAGE_CHANNELS) and permission overwrites (MANAGE_ROLES). */
export const EditChannelDialog = ({
  guild,
  channel: initial,
  onOpenChange,
}: EditChannelDialogProps) => {
  const { t } = useTranslation()
  const permissions = useGuildPermissions(guild)
  // Follow live updates (saved overwrites, renames) instead of the snapshot we were opened with.
  const channel = guild.channels.find((c) => c.id === initial.id) ?? initial
  const inChannel = permissions.inChannel(channel)
  const tabs: readonly Tab[] = [
    ...(can(inChannel, Permission.ManageChannels) ? (['overview'] as const) : []),
    ...(can(inChannel, Permission.ManageRoles) ? (['permissions'] as const) : []),
    // Webhooks post into text channels; managing them means managing the channel.
    ...(channel.type === 'text' && can(inChannel, Permission.ManageChannels)
      ? (['webhooks'] as const)
      : []),
    // Who follows an announcement channel: for those who manage it.
    ...(channel.type === 'text' && channel.announcement && can(inChannel, Permission.ManageChannels)
      ? (['followers'] as const)
      : []),
  ]
  const [chosen, setChosen] = useState<Tab | null>(null)
  const tab = chosen !== null && tabs.includes(chosen) ? chosen : tabs[0]

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('editChannel.title')}
      description={channel.name}
      size={tab === 'permissions' ? 'lg' : 'md'}
    >
      {tabs.length > 1 ? (
        <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setChosen(key)}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-text aria-selected:border-accent aria-selected:text-text"
            >
              {t(`channelPermissions.tabs.${key}`)}
            </button>
          ))}
        </div>
      ) : null}
      {tab === 'overview' ? (
        <ChannelOverviewTab
          guildId={guild.id}
          channel={channel}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
      {tab === 'permissions' ? <ChannelPermissionsTab guild={guild} channel={channel} /> : null}
      {tab === 'webhooks' ? <ChannelWebhooksTab channel={channel} /> : null}
      {tab === 'followers' ? <ChannelFollowersTab channel={channel} /> : null}
    </Dialog>
  )
}
