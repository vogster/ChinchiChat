import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { useApi } from '../../../lib/api-context'
import { errorMessage } from '../../../lib/errors'
import { usePublicOrigin } from '../../media/media-base'
import { inviteUrl } from '../invite-link'

import type { Channel, GuildDetail } from '@chinchi/shared'

export interface InviteDialogProps {
  readonly guild: GuildDetail
  readonly channel: Channel
  readonly onOpenChange: (open: boolean) => void
}

export const InviteDialog = ({ guild, channel, onOpenChange }: InviteDialogProps) => {
  const { t } = useTranslation()
  const api = useApi()
  const [permanent, setPermanent] = useState(false)
  const [copied, setCopied] = useState(false)

  // A query (not an effect) so StrictMode's double render does not create two invites.
  const invite = useQuery({
    queryKey: ['invite-link', channel.id, permanent],
    queryFn: async () =>
      (await api.invites.create(channel.id, permanent ? { maxAgeSeconds: 0 } : {})).invite,
    staleTime: Infinity,
    retry: false,
  })

  const origin = usePublicOrigin()
  const url = invite.data ? inviteUrl(invite.data.code, origin) : ''

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title={t('invite.title', { name: guild.name })}>
      <div className="flex flex-col gap-3">
        {invite.isError ? <Alert tone="error">{errorMessage(t, invite.error)}</Alert> : null}

        <label
          htmlFor="invite-link"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('invite.link')}
        </label>
        <div className="flex gap-2 rounded-md bg-rail p-1.5">
          <input
            id="invite-link"
            readOnly
            value={invite.isPending ? t('invite.creating') : url}
            onFocus={(event) => event.target.select()}
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <Button
            fullWidth={false}
            className="shrink-0 px-4 py-1.5"
            disabled={!invite.data}
            onClick={() => void copy()}
          >
            {copied ? t('invite.copied') : t('invite.copy')}
          </Button>
        </div>
        <p className="text-xs text-muted">{permanent ? t('invite.never') : t('invite.expires')}</p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(event) => {
              setCopied(false)
              setPermanent(event.target.checked)
            }}
          />
          {t('invite.neverToggle')}
        </label>
      </div>
    </Dialog>
  )
}
