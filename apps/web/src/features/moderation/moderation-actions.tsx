import { Permission } from '@chinchi/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { membersQueryOptions } from '../guilds/queries'
import { can, isAdministrator, isTimeoutRunning } from '../permissions/permissions'
import { useOutranks } from './use-outranks'

import type { ModerationKind } from './moderation-dialogs'
import type { Snowflake, UserProfile } from '@chinchi/shared'

/** A moderator's buttons on someone's card: timeout (or lift it), kick, ban. */
export const ModerationActions = ({
  profile,
  guildId,
  onModerate,
}: {
  profile: UserProfile
  guildId: Snowflake
  onModerate: (kind: ModerationKind) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const { guild, permissions, outranks } = useOutranks(guildId)
  const me = useCurrentUser()
  const { data: members = [] } = useQuery(membersQueryOptions(api, guildId))
  const lift = useMutation({
    mutationFn: () => api.moderation.timeout(guildId, profile.user.id, { until: null }),
  })
  // Nobody moderates themselves (the owner outranks everyone, themselves included).
  if (profile.user.id === me?.id) return null
  if (!guild || !profile.member || !outranks(profile.user.id, profile.member.roleIds)) return null

  const timeoutUntil = members.find((m) => m.user.id === profile.user.id)?.timeoutUntil ?? null
  const timedOut = isTimeoutRunning(timeoutUntil)
  const allowed = {
    timeout:
      can(permissions.base, Permission.ModerateMembers) &&
      (timedOut || !isAdministrator(guild, profile.member.roleIds)),
    kick: can(permissions.base, Permission.KickMembers),
    ban: can(permissions.base, Permission.BanMembers),
  }
  if (!allowed.timeout && !allowed.kick && !allowed.ban) return null

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {lift.isError ? <Alert tone="error">{errorMessage(t, lift.error)}</Alert> : null}
      {allowed.timeout ? (
        timedOut ? (
          <Button variant="secondary" pending={lift.isPending} onClick={() => lift.mutate()}>
            {t('moderation.timeout.lift')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onModerate('timeout')}>
            {t('moderation.timeout.action')}
          </Button>
        )
      ) : null}
      {allowed.kick ? (
        <Button variant="secondary" onClick={() => onModerate('kick')}>
          {t('moderation.kick.action')}
        </Button>
      ) : null}
      {allowed.ban ? (
        <Button variant="danger" onClick={() => onModerate('ban')}>
          {t('moderation.ban.action')}
        </Button>
      ) : null}
    </div>
  )
}
