import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../../../../components/layout/page-header'
import { guildQueryOptions } from '../../../../features/guilds/queries'

const GuildNotFound = () => {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader>{t('errors.UNKNOWN_GUILD')}</PageHeader>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted">{t('guild.notFound')}</p>
        <Link
          to="/"
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-contrast hover:opacity-90"
        >
          {t('notFound.home')}
        </Link>
      </div>
    </>
  )
}

export const Route = createFileRoute('/_app/_shell/channels/$guildId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(guildQueryOptions(context.api, params.guildId)),
  errorComponent: GuildNotFound,
  component: Outlet,
})
