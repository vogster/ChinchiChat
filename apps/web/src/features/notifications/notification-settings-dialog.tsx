import { Bell } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Dialog } from '../../components/ui/dialog'
import { HeaderPopover } from '../../components/ui/header-popover'
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

interface NotificationSettingsProps {
  readonly targetId: Snowflake
  readonly kind: NotificationTargetKind
  /** Shown in the title: "#general", the server's or the person's name. */
  readonly name: string
  readonly onClose: () => void
}

/** Mute (for a while or until lifted) and which messages notify, applied as they change. */
const NotificationSettingsForm = ({
  targetId,
  kind,
}: Pick<NotificationSettingsProps, 'targetId' | 'kind'>) => {
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
    <div className="flex flex-col gap-5">
      {update.isError ? <Alert tone="error">{errorMessage(t, update.error)}</Alert> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={muteId} className="px-1.5 text-[12.5px] font-medium text-faint">
          {t('notifications.mute')}
        </label>
        <select
          id={muteId}
          value={muteValue}
          onChange={(event) => onMute(event.target.value)}
          className="h-11 rounded-field bg-field px-3.5 text-text outline-none focus:ring-2 focus:ring-accent"
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
        <p className="px-1.5 text-xs text-faint">
          {muted
            ? mutedUntil
              ? t('notifications.mutedUntil', { time: formatEnd(mutedUntil, i18n.language) })
              : t('notifications.mutedForever')
            : t('notifications.muteHint')}
        </p>
      </div>

      {kind === 'dm' ? null : (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 px-1.5 text-[12.5px] font-medium text-faint">
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
  )
}

/** From the server menu: a window over the page. */
export const NotificationSettingsDialog = ({
  targetId,
  kind,
  name,
  onClose,
}: NotificationSettingsProps) => {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('notifications.title', { name })}
    >
      <NotificationSettingsForm targetId={targetId} kind={kind} />
    </Dialog>
  )
}

/** From a channel's or a DM's header: a popover over the chat, like threads and pins. */
export const NotificationSettingsPopover = ({
  targetId,
  kind,
  name,
  onClose,
}: NotificationSettingsProps) => {
  const { t } = useTranslation()
  return (
    <HeaderPopover
      label={t('notifications.title', { name })}
      title={t('notifications.popoverTitle')}
      subtitle={name}
      icon={<Bell className="size-[18px]" />}
      onClose={onClose}
    >
      <div className="px-1.5 pt-1 pb-2">
        <NotificationSettingsForm targetId={targetId} kind={kind} />
      </div>
    </HeaderPopover>
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
  <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-field px-3 transition-colors hover:bg-field has-checked:bg-accent-soft has-checked:text-accent-text has-focus-visible:ring-2 has-focus-visible:ring-accent">
    <input
      type="radio"
      name={`notification-level-${name}`}
      checked={checked}
      onChange={onChange}
      className="peer sr-only"
    />
    <span
      aria-hidden
      className="size-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_2px_var(--zl-faint)] peer-checked:shadow-[inset_0_0_0_5px_var(--zl-accent)]"
    />
    {label}
  </label>
)
