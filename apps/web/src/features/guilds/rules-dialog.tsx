import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { updateGuild } from './guild-cache'

import type { GuildDetail } from '@chinchi/shared'

/** The server's rules for a newcomer: accepting them opens the composer. */
export const RulesDialog = ({ guild, onClose }: { guild: GuildDetail; onClose: () => void }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: () => api.guilds.acceptRules(guild.id),
    onSuccess: ({ guild: updated }) => {
      updateGuild(queryClient, guild.id, (current) => ({
        ...current,
        myPending: updated.myPending,
      }))
      onClose()
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('rules.welcome', { name: guild.name })}
      description={t('rules.intro')}
    >
      <div className="flex flex-col gap-4">
        {accept.isError ? <Alert tone="error">{errorMessage(t, accept.error)}</Alert> : null}
        <div className="max-h-80 overflow-y-auto rounded-md bg-rail px-4 py-3 text-sm break-words whitespace-pre-wrap">
          {guild.rules}
        </div>
        <Button pending={accept.isPending} onClick={() => accept.mutate()}>
          {t('rules.accept')}
        </Button>
      </div>
    </Dialog>
  )
}
