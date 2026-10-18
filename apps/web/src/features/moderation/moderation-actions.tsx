import { Permission } from '@chinchi/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ban, Clock, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { membersQueryOptions } from '../guilds/queries'
import { can, isAdministrator, isTimeoutRunning } from '../permissions/permissions'
import { useOutranks } from './use-outranks'

import type { ModerationKind } from './moderation-dialogs'
import type { Snowflake, UserProfile } from '@chinchi/shared'

const tile =
  'flex h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-tile bg-danger-soft px-1 text-center text-xs font-medium text-danger transition hover:brightness-110 disabled:opacity-60'

/** A moderator's tiles on someone's card: timeout (or lift it), kick, ban. */
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
    <div className="flex flex-col gap-2">
      {lift.isError ? <Alert tone="error">{errorMessage(t, lift.error)}</Alert> : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1.5">
        {allowed.timeout ? (
          timedOut ? (
            <button
              type="button"
              disabled={lift.isPending}
              onClick={() => lift.mutate()}
              className={tile}
            >
              <Clock aria-hidden className="size-4" />
              {t('moderation.timeout.lift')}
            </button>
          ) : (
            <button type="button" onClick={() => onModerate('timeout')} className={tile}>
              <Clock aria-hidden className="size-4" />
              {t('moderation.timeout.action')}
            </button>
          )
        ) : null}
        {allowed.kick ? (
          <button type="button" onClick={() => onModerate('kick')} className={tile}>
            <UserX aria-hidden className="size-4" />
            {t('moderation.kick.action')}
          </button>
        ) : null}
        {allowed.ban ? (
          <button type="button" onClick={() => onModerate('ban')} className={tile}>
            <Ban aria-hidden className="size-4" />
            {t('moderation.ban.action')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
