import { CHANNEL_TOPIC_MAX_LENGTH } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { errorMessage } from '../../../lib/errors'
import { useDeleteChannel, useUpdateChannel } from '../use-guild-actions'

import type { Channel, Snowflake } from '@chinchi/shared'
import type { TFunction } from 'i18next'

const SLOWMODE_STEPS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21_600]

/** The usual steps, plus the current value if it was set to something else (e.g. via the API). */
const slowmodeOptions = (current: number) =>
  SLOWMODE_STEPS.includes(current)
    ? SLOWMODE_STEPS
    : [...SLOWMODE_STEPS, current].sort((a, b) => a - b)

const formatInterval = (t: TFunction, seconds: number) => {
  if (seconds === 0) return t('editChannel.slowmodeOff')
  if (seconds % 3600 === 0) return t('time.hours', { count: seconds / 3600 })
  if (seconds % 60 === 0) return t('time.minutes', { count: seconds / 60 })
  return t('time.seconds', { count: seconds })
}

export interface ChannelOverviewTabProps {
  readonly guildId: Snowflake
  readonly channel: Channel
  readonly onDone: () => void
}

/** Name, topic and deletion of a channel. */
export const ChannelOverviewTab = ({ guildId, channel, onDone }: ChannelOverviewTabProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState(channel.name)
  const [topic, setTopic] = useState(channel.topic ?? '')
  const [slowmode, setSlowmode] = useState(channel.rateLimitPerUser)
  const [nsfw, setNsfw] = useState(channel.nsfw)
  const [announcement, setAnnouncement] = useState(channel.announcement)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const update = useUpdateChannel(guildId)
  const remove = useDeleteChannel(guildId)

  // Topic, slowmode and the NSFW flag only make sense where people write.
  const hasTopic = channel.type === 'text'
  const changed =
    name !== channel.name ||
    (hasTopic &&
      (topic !== (channel.topic ?? '') ||
        slowmode !== channel.rateLimitPerUser ||
        nsfw !== channel.nsfw ||
        announcement !== channel.announcement))
  const error = update.error ?? remove.error

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate(
          {
            channelId: channel.id,
            body: {
              ...(name !== channel.name ? { name } : {}),
              ...(hasTopic && topic !== (channel.topic ?? '')
                ? { topic: topic.trim() || null }
                : {}),
              ...(hasTopic && slowmode !== channel.rateLimitPerUser
                ? { rateLimitPerUser: slowmode }
                : {}),
              ...(hasTopic && nsfw !== channel.nsfw ? { nsfw } : {}),
              ...(hasTopic && announcement !== channel.announcement ? { announcement } : {}),
            },
          },
          { onSuccess: onDone },
        )
      }}
    >
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}

      <TextField
        label={t('editChannel.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {hasTopic ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="channel-topic"
            className="text-xs font-bold tracking-wide text-muted uppercase"
          >
            {t('editChannel.topic')}
          </label>
          <textarea
            id="channel-topic"
            value={topic}
            maxLength={CHANNEL_TOPIC_MAX_LENGTH}
            placeholder={t('editChannel.topicPlaceholder')}
            onChange={(event) => setTopic(event.target.value)}
            rows={3}
            className="resize-none rounded-md border border-line bg-rail px-3 py-2 outline-none focus:border-accent"
          />
        </div>
      ) : null}
      {hasTopic ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="channel-slowmode"
              className="text-xs font-bold tracking-wide text-muted uppercase"
            >
              {t('editChannel.slowmode')}
            </label>
            <select
              id="channel-slowmode"
              value={slowmode}
              onChange={(event) => setSlowmode(Number(event.target.value))}
              className="rounded-md border border-line bg-rail px-3 py-2"
            >
              {slowmodeOptions(channel.rateLimitPerUser).map((seconds) => (
                <option key={seconds} value={seconds}>
                  {formatInterval(t, seconds)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">{t('editChannel.slowmodeHint')}</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(event) => setNsfw(event.target.checked)}
              className="mt-0.5 accent-[var(--zl-accent)]"
            />
            <span>
              {t('editChannel.nsfw')}
              <span className="block text-xs text-muted">{t('editChannel.nsfwHint')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={announcement}
              onChange={(event) => setAnnouncement(event.target.checked)}
              className="mt-0.5 accent-[var(--zl-accent)]"
            />
            <span>
              {t('editChannel.announcement')}
              <span className="block text-xs text-muted">{t('editChannel.announcementHint')}</span>
            </span>
          </label>
        </>
      ) : null}

      <Button type="submit" pending={update.isPending} disabled={!changed || !name.trim()}>
        {t('editChannel.save')}
      </Button>

      <hr className="border-line" />

      {confirmingDelete ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('editChannel.confirmDelete', { name: channel.name })}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              pending={remove.isPending}
              onClick={() => remove.mutate(channel.id, { onSuccess: onDone })}
            >
              {t('editChannel.confirm')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          {t('editChannel.delete')}
        </Button>
      )}
    </form>
  )
}
