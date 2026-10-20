import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { userName } from '../dms/dm-names'

import type { PollAnswer } from '@chinchi/shared'

/** The answer's first voters as overlapping avatars; a click lists all of them. */
export const VoterStack = ({ answer, onOpen }: { answer: PollAnswer; onOpen: () => void }) => {
  const { t } = useTranslation()
  if (answer.sample.length === 0) return null
  return (
    <button
      type="button"
      aria-label={t('polls.voters', { answer: answer.text })}
      onClick={onOpen}
      className="relative z-10 flex shrink-0 items-center rounded-full p-0.5 transition hover:bg-text/10"
    >
      {answer.sample.map((user, index) => (
        <span key={user.id} className={index > 0 ? '-ml-1.5' : ''}>
          <Avatar
            name={userName(user)}
            src={user.avatarUrl}
            id={user.id}
            className="size-5 ring-2 ring-stage"
          />
        </span>
      ))}
    </button>
  )
}

/** Everyone who picked an answer (the first hundred). */
export const VotersDialog = ({
  channelId,
  messageId,
  answer,
  onOpenChange,
}: {
  channelId: string
  messageId: string
  answer: PollAnswer
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const voters = useQuery({
    queryKey: ['pollVoters', messageId, answer.id],
    queryFn: async () =>
      (await api.polls.voters(channelId, messageId, answer.id, { limit: 100 })).users,
  })

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('polls.votersTitle', { answer: answer.text })}
      description={t('polls.votes', { count: answer.count })}
    >
      {voters.isError ? <Alert tone="error">{errorMessage(t, voters.error)}</Alert> : null}
      {voters.data ? (
        <ul className="flex flex-col gap-1" aria-label={t('polls.votersList')}>
          {voters.data.map((user) => (
            <li key={user.id} className="flex items-center gap-3 rounded-field px-2 py-1.5">
              <Avatar name={userName(user)} src={user.avatarUrl} id={user.id} className="size-8" />
              <span className="min-w-0 flex-1 truncate font-medium">{userName(user)}</span>
            </li>
          ))}
        </ul>
      ) : voters.isPending ? (
        <p className="text-sm text-muted">{t('polls.votersLoading')}</p>
      ) : null}
    </Dialog>
  )
}
