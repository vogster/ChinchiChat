import { GUILD_NAME_MAX_LENGTH, GUILD_NAME_MIN_LENGTH } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { guildInitials } from './initials'
import { JoinGuildForm } from './join-guild-form'
import { useAcceptInvite, useCreateGuild } from './use-guild-actions'

export interface CreateGuildDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type Mode = 'create' | 'join'
const MODES: readonly Mode[] = ['create', 'join']

const segmentClass =
  'h-9 flex-1 rounded-full text-[13px] font-medium text-muted transition-colors hover:text-text aria-selected:bg-chip aria-selected:text-text'

/** Making a new server, or joining one by invite: two tabs of one window. */
export const CreateGuildDialog = ({ open, onOpenChange }: CreateGuildDialogProps) => {
  const { t, i18n } = useTranslation()
  const user = useCurrentUser()
  const [mode, setMode] = useState<Mode>('create')
  const [name, setName] = useState(() =>
    t('createGuild.defaultName', { username: user?.username ?? '' }),
  )
  const create = useCreateGuild()
  const join = useAcceptInvite()

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      create.reset()
      join.reset()
    }
  }

  const trimmed = name.trim()
  const nameValid =
    trimmed.length >= GUILD_NAME_MIN_LENGTH && trimmed.length <= GUILD_NAME_MAX_LENGTH
  const error = mode === 'create' ? create.error : join.error

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('createGuild.title')}
      description={t('createGuild.subtitle')}
    >
      <div className="flex flex-col gap-5">
        <div role="tablist" className="flex gap-1 rounded-card bg-stage p-1">
          {MODES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={segmentClass}
            >
              {t(`createGuild.modes.${value}`)}
            </button>
          ))}
        </div>

        {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}

        {mode === 'create' ? (
          <form
            role="tabpanel"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!nameValid) return
              const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
              create.mutate({ name: trimmed, locale }, { onSuccess: () => close(false) })
            }}
          >
            {/* The icon the server starts with: its initials, until a picture is uploaded. */}
            <span
              aria-hidden
              data-testid="guild-icon-preview"
              className="mx-auto grid size-[76px] place-items-center rounded-panel bg-accent text-2xl font-semibold text-accent-contrast"
            >
              {guildInitials(trimmed).toLocaleUpperCase() || '?'}
            </span>
            <TextField
              label={t('createGuild.name')}
              value={name}
              maxLength={GUILD_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" pending={create.isPending} disabled={!nameValid}>
              {t('createGuild.submit')}
            </Button>
          </form>
        ) : (
          <div role="tabpanel">
            <JoinGuildForm join={join} onJoined={() => close(false)} />
          </div>
        )}
      </div>
    </Dialog>
  )
}
