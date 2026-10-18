import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Dialog } from '../../components/ui/dialog'
import { errorMessage } from '../../lib/errors'
import {
  useNotificationResolver,
  useNotificationSettings,
  useUpdateNotificationSetting,
} from './use-notifications'

import type { NotificationLevel, Snowflake } from '@chinchi/shared'

/** What the settings are for: a server, a server channel (can inherit) or a DM (mute only). */
export type NotificationTargetKind = 'guild' | 'channel' | 'dm'

const DURATIONS = [
  { key: '15m', minutes: 15 },
  { key: '1h', minutes: 60 },
  { key: '8h', minutes: 480 },
  { key: '24h', minutes: 1440 },
] as const

const LEVELS: readonly NotificationLevel[] = ['all', 'mentions', 'none']

const formatEnd = (iso: string, language: string) => {
  const end = new Date(iso)
  const sameDay = end.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(language, {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(end)
}

/** Mute (for a while or until lifted) and which messages notify, applied as they change. */
export const NotificationSettingsDialog = ({
  targetId,
  kind,
  name,
  onClose,
}: {
  targetId: Snowflake
  kind: NotificationTargetKind
  /** Shown in the title: "#general", the server's or the person's name. */
  name: string
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const muteId = useId()
  const setting = useNotificationSettings().get(targetId)
  const update = useUpdateNotificationSetting(targetId)
  const mutedUntil = setting?.muted ? setting.mutedUntil : null
  // This target's own mute (not its parents'), with the shared minute clock.
  const muted = useNotificationResolver()({ id: targetId }).muted
  const muteValue = !muted ? 'off' : mutedUntil ? 'timed' : 'forever'
  // A server without a level notifies about everything; a channel follows its server.
  const level = setting?.level ?? (kind === 'guild' ? 'all' : null)

  const onMute = (value: string) => {
    if (value === 'off') return update.mutate({ muted: false })
    if (value === 'forever') return update.mutate({ muted: true })
    const duration = DURATIONS.find((d) => d.key === value)
    if (!duration) return
    update.mutate({
      muted: true,
      mutedUntil: new Date(Date.now() + duration.minutes * 60_000).toISOString(),
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('notifications.title', { name })}
    >
      <div className="flex flex-col gap-5">
        {update.isError ? <Alert tone="error">{errorMessage(t, update.error)}</Alert> : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={muteId} className="text-xs font-bold tracking-wide text-muted uppercase">
            {t('notifications.mute')}
          </label>
          <select
            id={muteId}
            value={muteValue}
            onChange={(event) => onMute(event.target.value)}
            className="rounded-md border border-line bg-rail px-3 py-2 text-text outline-none focus:border-accent"
          >
            <option value="off">{t('notifications.muteOff')}</option>
            {muteValue === 'timed' && mutedUntil ? (
              <option value="timed">
                {t('notifications.muteUntilOption', { time: formatEnd(mutedUntil, i18n.language) })}
              </option>
            ) : null}
            {DURATIONS.map((duration) => (
              <option key={duration.key} value={duration.key}>
                {t(`notifications.duration.${duration.key}`)}
              </option>
            ))}
            <option value="forever">{t('notifications.muteForever')}</option>
          </select>
          <p className="text-xs text-muted">
            {muted
              ? mutedUntil
                ? t('notifications.mutedUntil', { time: formatEnd(mutedUntil, i18n.language) })
                : t('notifications.mutedForever')
              : t('notifications.muteHint')}
          </p>
        </div>

        {kind === 'dm' ? null : (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">
              {t('notifications.level')}
            </legend>
            {kind === 'channel' ? (
              <LevelOption
                name={targetId}
                label={t('notifications.inherit')}
                checked={level === null}
                onChange={() => update.mutate({ level: null })}
              />
            ) : null}
            {LEVELS.map((option) => (
              <LevelOption
                key={option}
                name={targetId}
                label={t(`notifications.levels.${option}`)}
                checked={level === option}
                onChange={() => update.mutate({ level: option })}
              />
            ))}
          </fieldset>
        )}
      </div>
    </Dialog>
  )
}

const LevelOption = ({
  name,
  label,
  checked,
  onChange,
}: {
  name: string
  label: string
  checked: boolean
  onChange: () => void
}) => (
  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-chip">
    <input
      type="radio"
      name={`notification-level-${name}`}
      checked={checked}
      onChange={onChange}
      className="accent-accent"
    />
    {label}
  </label>
)
