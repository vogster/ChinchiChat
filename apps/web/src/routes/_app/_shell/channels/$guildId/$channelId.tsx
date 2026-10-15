import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { PageHeader } from '../../../../../components/layout/page-header'
import { ChannelView } from '../../../../../features/guilds/channel-view'
import { guildQueryOptions } from '../../../../../features/guilds/queries'
import { VoiceChannelView } from '../../../../../features/voice/voice-channel-view'
import { useApi } from '../../../../../lib/api-context'

const ChannelPage = () => {
  const { t } = useTranslation()
  const { guildId, channelId } = Route.useParams()
  const { thread } = Route.useSearch()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const channel = guild.channels.find((c) => c.id === channelId && c.type !== 'category')

  if (!channel) {
    return (
      <>
        <PageHeader>{guild.name}</PageHeader>
        <p className="flex flex-1 items-center justify-center text-muted">
          {t('errors.UNKNOWN_CHANNEL')}
        </p>
      </>
    )
  }
  if (channel.type === 'voice') return <VoiceChannelView key={channel.id} channel={channel} />
  return <ChannelView key={channel.id} guild={guild} channel={channel} thread={thread} />
}

// The side panel of a text channel: its thread list, or a thread opened beside it. Ids may come
// back from the URL as numbers, hence the coercion; anything else simply closes the panel.
const searchSchema = z.object({
  thread: z
    .union([z.literal('list'), z.coerce.string().regex(/^\d{1,20}$/)])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/_app/_shell/channels/$guildId/$channelId')({
  validateSearch: searchSchema,
  component: ChannelPage,
})
