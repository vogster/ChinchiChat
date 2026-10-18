import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { AuthCard } from '../../features/auth/auth-card'
import { meQueryOptions } from '../../features/auth/queries'
import { useCurrentUser } from '../../features/auth/use-auth-actions'
import { GuildIcon } from '../../features/guilds/guild-icon'
import { inviteQueryOptions } from '../../features/guilds/queries'
import { useAcceptInvite } from '../../features/guilds/use-guild-actions'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

const linkButton =
  'block rounded-md px-4 py-2.5 text-center font-medium transition hover:opacity-90'

const InvitePage = () => {
  const { t } = useTranslation()
  const { code } = Route.useParams()
  const user = useCurrentUser()
  const invite = useQuery(inviteQueryOptions(useApi(), code))
  const accept = useAcceptInvite()

  if (invite.isPending) {
    return (
      <AuthCard title={t('invite.pageTitle')}>
        <p className="text-center text-muted">{t('common.loading')}</p>
      </AuthCard>
    )
  }

  if (invite.isError) {
    return (
      <AuthCard title={t('invite.invalid')} subtitle={t('invite.invalidText')}>
        <Link to="/" className={`${linkButton} bg-accent text-accent-contrast`}>
          {t('notFound.home')}
        </Link>
      </AuthCard>
    )
  }

  const { guild, inviter } = invite.data
  const back = `/invite/${code}`

  return (
    <AuthCard
      title={guild.name}
      subtitle={
        inviter
          ? t('invite.invitedBy', { name: inviter.displayName ?? inviter.username })
          : t('invite.pageTitle')
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-3xl bg-field">
          <GuildIcon id={guild.id} name={guild.name} iconUrl={guild.iconUrl} className="text-2xl" />
        </div>
        <p className="text-sm text-muted">
          {t('invite.memberCount', { count: guild.memberCount })}
        </p>

        {accept.isError ? <Alert tone="error">{errorMessage(t, accept.error)}</Alert> : null}

        <div className="flex w-full flex-col gap-2">
          {user ? (
            <Button pending={accept.isPending} onClick={() => accept.mutate(code)}>
              {t('invite.accept')}
            </Button>
          ) : (
            <>
              <Link
                to="/login"
                search={{ redirect: back }}
                className={`${linkButton} bg-accent text-accent-contrast`}
              >
                {t('invite.loginToAccept')}
              </Link>
              <Link
                to="/register"
                search={{ redirect: back }}
                className={`${linkButton} bg-field text-text`}
              >
                {t('invite.registerToAccept')}
              </Link>
            </>
          )}
        </div>
      </div>
    </AuthCard>
  )
}

export const Route = createFileRoute('/invite/$code')({
  // Guests see the preview too; signed-in users can accept right away.
  loader: ({ context }) => context.queryClient.ensureQueryData(meQueryOptions(context.api)),
  component: InvitePage,
})
