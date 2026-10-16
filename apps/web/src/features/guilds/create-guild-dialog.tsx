import { GUILD_NAME_MAX_LENGTH, GUILD_NAME_MIN_LENGTH } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { parseInviteCode } from './invite-link'
import { useAcceptInvite, useCreateGuild } from './use-guild-actions'

export interface CreateGuildDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export const CreateGuildDialog = ({ open, onOpenChange }: CreateGuildDialogProps) => {
  const { t, i18n } = useTranslation()
  const user = useCurrentUser()
  const [name, setName] = useState(() =>
    t('createGuild.defaultName', { username: user?.username ?? '' }),
  )
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const create = useCreateGuild()
  const join = useAcceptInvite()

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      create.reset()
      join.reset()
      setLinkError(null)
    }
  }

  const trimmed = name.trim()
  const nameValid =
    trimmed.length >= GUILD_NAME_MIN_LENGTH && trimmed.length <= GUILD_NAME_MAX_LENGTH
  const error = create.error ?? join.error

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('createGuild.title')}
      description={t('createGuild.subtitle')}
    >
      <div className="flex flex-col gap-5">
        {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!nameValid) return
            const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
            create.mutate({ name: trimmed, locale }, { onSuccess: () => close(false) })
          }}
        >
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

        <hr className="border-border" />

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const code = parseInviteCode(link)
            if (!code) {
              setLinkError(t('createGuild.invalidLink'))
              return
            }
            setLinkError(null)
            join.mutate(code, { onSuccess: () => close(false) })
          }}
        >
          <h3 className="font-semibold">{t('createGuild.joinTitle')}</h3>
          <TextField
            label={t('createGuild.joinLabel')}
            placeholder={t('createGuild.joinPlaceholder')}
            value={link}
            error={linkError ?? undefined}
            onChange={(event) => setLink(event.target.value)}
          />
          <Button type="submit" variant="secondary" pending={join.isPending}>
            {t('createGuild.join')}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
