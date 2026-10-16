import { Permission } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
  CheckCheck,
  ChevronDown,
  FolderPlus,
  LogOut,
  PlusCircle,
  Settings,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UserPanel } from '../../components/layout/user-panel'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu'
import { useApi } from '../../lib/api-context'
import { useMentionCounts } from '../messages/mentions'
import { isUnread, useReadStates } from '../messages/use-messages'
import { NotificationSettingsDialog } from '../notifications/notification-settings-dialog'
import { useNotificationResolver } from '../notifications/use-notifications'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { allowedSections } from '../server-settings/sections'
import { ChannelList } from './channel-list'
import { firstTextChannel } from './channel-tree'
import { CreateChannelDialog } from './dialogs/create-channel-dialog'
import { EditChannelDialog } from './dialogs/edit-channel-dialog'
import { InviteDialog } from './dialogs/invite-dialog'
import { LeaveGuildDialog } from './dialogs/leave-guild-dialog'
import { guildQueryOptions } from './queries'
import { useAckGuild } from './use-ack-guild'
import { useChannelReorder } from './use-channel-reorder'

import type { Channel, Snowflake } from '@chinchi/shared'

type OpenDialog =
  | { readonly kind: 'invite' }
  | { readonly kind: 'notifications' }
  | { readonly kind: 'leave' }
  | { readonly kind: 'create'; readonly type: 'text' | 'category'; readonly parent: Channel | null }
  | { readonly kind: 'edit'; readonly channel: Channel }

export interface GuildSidebarProps {
  readonly guildId: Snowflake
  readonly channelId?: Snowflake | undefined
}

export const GuildSidebar = ({ guildId, channelId }: GuildSidebarProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: guild } = useQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const mentionCounts = useMentionCounts()
  const readStates = useReadStates()
  const moveChannel = useChannelReorder(guildId)
  const resolveNotifications = useNotificationResolver()
  const ackGuild = useAckGuild()

  if (!guild) return <aside className="w-60 shrink-0 bg-sidebar" />

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null)
  }
  const inviteChannel =
    guild.channels.find((c) => c.id === channelId && c.type === 'text') ??
    firstTextChannel(guild.channels)
  const canInvite =
    inviteChannel !== undefined &&
    can(permissions.inChannel(inviteChannel), Permission.CreateInvite)
  const canManageChannels = can(permissions.base, Permission.ManageChannels)
  const canOpenSettings = allowedSections(permissions.base).length > 0

  return (
    <aside aria-label={guild.name} className="flex w-60 shrink-0 flex-col bg-sidebar">
      <Menu>
        <MenuTrigger
          aria-label={t('guild.menu', { name: guild.name })}
          className="flex h-12 items-center justify-between gap-2 border-b border-border px-4 text-left font-semibold shadow-sm hover:bg-hover data-[state=open]:bg-hover"
        >
          <span className="truncate">{guild.name}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </MenuTrigger>
        <MenuContent>
          {canInvite ? (
            <MenuItem
              onSelect={() => setDialog({ kind: 'invite' })}
              icon={<UserPlus aria-hidden className="size-4" />}
            >
              {t('guild.invite')}
            </MenuItem>
          ) : null}
          <MenuItem
            onSelect={() => ackGuild.mutate(guild)}
            icon={<CheckCheck aria-hidden className="size-4" />}
          >
            {t('guild.markRead')}
          </MenuItem>
          <MenuItem
            onSelect={() => setDialog({ kind: 'notifications' })}
            icon={<Bell aria-hidden className="size-4" />}
          >
            {t('notifications.menu')}
          </MenuItem>
          {canOpenSettings ? (
            <MenuItem
              onSelect={() =>
                void navigate({ to: '/server-settings/$guildId', params: { guildId: guild.id } })
              }
              icon={<Settings aria-hidden className="size-4" />}
            >
              {t('guild.settings')}
            </MenuItem>
          ) : null}
          {canManageChannels ? (
            <>
              <MenuItem
                onSelect={() => setDialog({ kind: 'create', type: 'text', parent: null })}
                icon={<PlusCircle aria-hidden className="size-4" />}
              >
                {t('guild.createChannel')}
              </MenuItem>
              <MenuItem
                onSelect={() => setDialog({ kind: 'create', type: 'category', parent: null })}
                icon={<FolderPlus aria-hidden className="size-4" />}
              >
                {t('guild.createCategory')}
              </MenuItem>
            </>
          ) : null}
          {permissions.isOwner ? null : (
            <>
              <MenuSeparator />
              <MenuItem
                danger
                onSelect={() => setDialog({ kind: 'leave' })}
                icon={<LogOut aria-hidden className="size-4" />}
              >
                {t('guild.leave')}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      <ChannelList
        channels={guild.channels}
        // Without read states yet, show nothing as unread rather than everything.
        mentionCount={(channel) => mentionCounts[channel.id] ?? 0}
        isMuted={(channel) => resolveNotifications(channel, guild.channels).muted}
        isUnread={(channel) =>
          readStates !== undefined &&
          !resolveNotifications(channel, guild.channels).muted &&
          channel.type === 'text' &&
          channel.id !== channelId &&
          isUnread(channel.lastMessageId, readStates[channel.id])
        }
        canCreate={canManageChannels}
        canManage={(channel) =>
          can(permissions.inChannel(channel), Permission.ManageChannels) ||
          can(permissions.inChannel(channel), Permission.ManageRoles)
        }
        onCreateIn={(category) => setDialog({ kind: 'create', type: 'text', parent: category })}
        canReorder={canManageChannels}
        onMove={(id, drop) => moveChannel(guild.channels, id, drop)}
        onEdit={(channel) => setDialog({ kind: 'edit', channel })}
      />

      <UserPanel />

      {dialog?.kind === 'invite' && inviteChannel ? (
        <InviteDialog guild={guild} channel={inviteChannel} onOpenChange={closeDialog} />
      ) : null}
      {dialog?.kind === 'notifications' ? (
        <NotificationSettingsDialog
          targetId={guild.id}
          kind="guild"
          name={guild.name}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'leave' ? (
        <LeaveGuildDialog guild={guild} onOpenChange={closeDialog} />
      ) : null}
      {dialog?.kind === 'create' ? (
        <CreateChannelDialog
          guildId={guild.id}
          initialType={dialog.type}
          parent={dialog.parent}
          onOpenChange={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditChannelDialog guild={guild} channel={dialog.channel} onOpenChange={closeDialog} />
      ) : null}
    </aside>
  )
}
