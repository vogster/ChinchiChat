import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { THREAD_NAME_MAX_LENGTH } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { upsertChannel } from '../guilds/guild-cache'

import type { Snowflake } from '@chinchi/shared'

/** A first guess at the thread's name: the start of the message's first line. */
const suggestName = (content: string) => (content.split('\n')[0] ?? '').trim().slice(0, 60) || ''

/** Starts a thread from a message and opens it. */
export const CreateThreadDialog = ({
  guildId,
  channelId,
  messageId,
  content,
  onClose,
}: {
  guildId: Snowflake
  channelId: Snowflake
  messageId: Snowflake
  content: string
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(() => suggestName(content))
  const create = useMutation({
    mutationFn: () => api.channels.createThread(channelId, { name: name.trim(), messageId }),
    onSuccess: async ({ channel }) => {
      upsertChannel(queryClient, channel)
      onClose()
      // Opens beside its channel, as in Discord.
      await navigate({
        to: '/channels/$guildId/$channelId',
        params: { guildId, channelId },
        search: { thread: channel.id },
      })
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('threads.newTitle')}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <TextField
          label={t('threads.name')}
          value={name}
          maxLength={THREAD_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
        {create.isError ? <Alert tone="error">{errorMessage(t, create.error)}</Alert> : null}
        <Button type="submit" pending={create.isPending} disabled={!name.trim()}>
          {t('threads.create')}
        </Button>
      </form>
    </Dialog>
  )
}
