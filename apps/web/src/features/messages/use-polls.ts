import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { messageKeys } from './queries'

import type { MessagePages } from './queries'
import type { Poll, Snowflake } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

/**
 * Puts a poll's new state on its message. Copies from the gateway don't know `me`: then the
 * marks of my own answers stay as the cache had them.
 */
export const applyPoll = (
  queryClient: QueryClient,
  channelId: Snowflake,
  messageId: Snowflake,
  poll: Poll,
  { keepMine = false }: { keepMine?: boolean } = {},
) =>
  queryClient.setQueryData<MessagePages>(messageKeys.channel(channelId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) =>
            page.map((message) => {
              if (message.id !== messageId) return message
              if (!keepMine || !message.poll) return { ...message, poll }
              const before = message.poll
              return {
                ...message,
                poll: {
                  ...poll,
                  answers: poll.answers.map((answer) => ({
                    ...answer,
                    me: before.answers.find((a) => a.id === answer.id)?.me ?? false,
                  })),
                },
              }
            }),
          ),
        }
      : data,
  )

export const usePollActions = (channelId: Snowflake, messageId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const vote = useMutation({
    mutationFn: (answerIds: readonly number[]) => api.polls.vote(channelId, messageId, answerIds),
    onSuccess: ({ poll }) => applyPoll(queryClient, channelId, messageId, poll),
  })
  const end = useMutation({
    mutationFn: () => api.polls.end(channelId, messageId),
    onSuccess: ({ poll }) => applyPoll(queryClient, channelId, messageId, poll),
  })
  return { vote, end }
}
