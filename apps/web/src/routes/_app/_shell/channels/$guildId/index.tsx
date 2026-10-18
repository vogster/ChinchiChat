import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../../../../components/layout/main-card'
import { PageHeader } from '../../../../../components/layout/page-header'
import { firstTextChannel } from '../../../../../features/guilds/channel-tree'
import { guildQueryOptions } from '../../../../../features/guilds/queries'

const NoTextChannels = () => {
  const { t } = useTranslation()
  const guild = Route.useLoaderData()
  return (
    <MainCard>
      <PageHeader>{guild.name}</PageHeader>
      <p className="flex flex-1 items-center justify-center p-8 text-center text-muted">
        {t('guild.noTextChannels')}
      </p>
    </MainCard>
  )
}

/** Opening a server lands on its first text channel. */
export const Route = createFileRoute('/_app/_shell/channels/$guildId/')({
  loader: async ({ context, params }) => {
    const guild = await context.queryClient.ensureQueryData(
      guildQueryOptions(context.api, params.guildId),
    )
    const channel = firstTextChannel(guild.channels)
    if (channel) {
      throw redirect({
        to: '/channels/$guildId/$channelId',
        params: { guildId: guild.id, channelId: channel.id },
        replace: true,
      })
    }
    return guild
  },
  component: NoTextChannels,
})
