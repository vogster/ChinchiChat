import { Permission } from '@chinchi/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { guildQueryOptions, guildsQueryOptions } from '../guilds/queries'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'

import type { Channel } from '@chinchi/shared'
import type { ReactNode } from 'react'

const selectClass = 'rounded-md border border-border bg-rail px-3 py-2'

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-xs font-bold tracking-wide text-muted uppercase">
      {label}
    </label>
    {children}
  </div>
)

/** Text channels of the chosen server that the user manages (where a follow can go). */
const ChannelPicker = ({
  guildId,
  sourceId,
  value,
  onChange,
}: {
  guildId: string
  sourceId: string
  value: string
  onChange: (channelId: string) => void
}) => {
  const { t } = useTranslation()
  const { data: guild } = useQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  const targets = (guild?.channels ?? []).filter(
    (c) =>
      c.type === 'text' &&
      c.id !== sourceId &&
      can(permissions.inChannel(c), Permission.ManageChannels),
  )
  if (!guild) return null
  if (targets.length === 0)
    return <p className="text-sm text-muted">{t('announcements.noTargets')}</p>
  return (
    <Field id="follow-channel" label={t('announcements.channel')}>
      <select
        id="follow-channel"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        <option value="">{t('announcements.pickChannel')}</option>
        {targets.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Follows an announcement channel into a channel the user manages, on any of their servers. */
export const FollowDialog = ({
  channel,
  onOpenChange,
}: {
  channel: Channel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const { data: guilds = [] } = useQuery(guildsQueryOptions(api))
  const [guildId, setGuildId] = useState('')
  const [targetId, setTargetId] = useState('')
  const follow = useMutation({ mutationFn: () => api.announcements.follow(channel.id, targetId) })

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('announcements.followTitle', { name: channel.name })}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (targetId) follow.mutate()
        }}
      >
        <p className="text-sm text-muted">{t('announcements.followHint')}</p>
        <Field id="follow-guild" label={t('announcements.guild')}>
          <select
            id="follow-guild"
            value={guildId}
            onChange={(event) => {
              setGuildId(event.target.value)
              setTargetId('')
            }}
            className={selectClass}
          >
            <option value="">{t('announcements.pickGuild')}</option>
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
        </Field>
        {guildId ? (
          <ChannelPicker
            guildId={guildId}
            sourceId={channel.id}
            value={targetId}
            onChange={setTargetId}
          />
        ) : null}
        {follow.isError ? <Alert tone="error">{errorMessage(t, follow.error)}</Alert> : null}
        {follow.isSuccess ? <Alert tone="success">{t('announcements.followed')}</Alert> : null}
        <Button type="submit" pending={follow.isPending} disabled={!targetId}>
          {t('announcements.follow')}
        </Button>
      </form>
    </Dialog>
  )
}
