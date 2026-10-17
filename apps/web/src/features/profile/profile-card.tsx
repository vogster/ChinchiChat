import { Permission } from '@chinchi/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { PresenceDot } from '../../components/ui/presence-dot'
import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { useOpenDm } from '../dms/use-dm-actions'
import { useOpenDmWith } from '../dms/use-open-dm-with'
import { BetaBadge } from '../e2ee/beta-badge'
import { useRelationshipActions } from '../friends/use-relationship-actions'
import { guildQueryOptions, guildsQueryOptions } from '../guilds/queries'
import { usePresence } from '../messages/use-presence'
import { ModerationActions } from '../moderation/moderation-actions'
import { useOutranks } from '../moderation/use-outranks'
import { can, toHexColor } from '../permissions/permissions'
import { CustomStatusLine } from '../presence/custom-status-line'
import { ProfileBanner } from './profile-banner'
import { profileKeys, profileQueryOptions } from './queries'

import type { ModerationKind } from '../moderation/moderation-dialogs'
import type { Snowflake, UserProfile } from '@chinchi/shared'

const formatDate = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  )

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-1">
    <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{title}</h3>
    {children}
  </section>
)

/** What you can do with someone from their card: message, befriend, block, rename. */
const ProfileActions = ({
  profile,
  guildId,
  onNickname,
}: {
  profile: UserProfile
  guildId: Snowflake | null
  onNickname: () => void
}) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const openDm = useOpenDm()
  // Opened from your DM with them: the matching button would lead right back here.
  const shared = useOpenDmWith(profile.user.id)
  const actions = useRelationshipActions()
  const { permissions, outranks } = useOutranks(guildId)
  const self = profile.user.id === me?.id
  const refresh = {
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(profile.user.id) }),
  }
  // Others' nicknames also need a higher role.
  const canRename =
    profile.member !== null &&
    (self || outranks(profile.user.id, profile.member.roleIds)) &&
    can(permissions.base, self ? Permission.ChangeNickname : Permission.ManageNicknames)

  if (self) {
    return (
      <div className="flex flex-col gap-2">
        <Link
          to="/settings/profile"
          className="rounded-md bg-elevated px-3 py-2 text-center text-sm font-medium hover:bg-hover"
        >
          {t('profile.edit')}
        </Link>
        {canRename ? (
          <Button variant="secondary" onClick={onNickname}>
            {t('profile.changeNickname')}
          </Button>
        ) : null}
      </div>
    )
  }

  const { relationship } = profile
  return (
    <div className="flex flex-col gap-2">
      {relationship !== 'blocked' && (!shared || shared.encrypted) ? (
        <Button onClick={() => openDm.mutate([profile.user.id])} pending={openDm.isPending}>
          {t('friends.message')}
        </Button>
      ) : null}
      {relationship !== 'blocked' && !shared?.encrypted ? (
        <Button
          variant="secondary"
          onClick={() => openDm.mutate({ ids: [profile.user.id], encrypted: true })}
          pending={openDm.isPending}
        >
          <span className="inline-flex items-center gap-2">
            <Lock aria-hidden className="size-4" />
            {t('e2ee.start')}
            <BetaBadge />
          </span>
        </Button>
      ) : null}
      {relationship === null ? (
        <Button
          variant="secondary"
          pending={actions.request.isPending}
          onClick={() => actions.request.mutate(profile.user.username, refresh)}
        >
          {t('friends.tabs.add')}
        </Button>
      ) : null}
      {relationship === 'pending_in' ? (
        <Button variant="secondary" onClick={() => actions.accept.mutate(profile.user.id, refresh)}>
          {t('profile.acceptRequest')}
        </Button>
      ) : null}
      {relationship === 'pending_out' ? (
        <Button variant="secondary" disabled>
          {t('profile.requestSent')}
        </Button>
      ) : null}
      {canRename ? (
        <Button variant="secondary" onClick={onNickname}>
          {t('profile.changeNickname')}
        </Button>
      ) : null}
      {relationship === 'blocked' ? (
        <Button variant="secondary" onClick={() => actions.remove.mutate(profile.user.id, refresh)}>
          {t('friends.unblock')}
        </Button>
      ) : (
        <Button variant="danger" onClick={() => actions.block.mutate(profile.user.id, refresh)}>
          {t('friends.block')}
        </Button>
      )}
    </div>
  )
}

/** Someone's profile card: who they are, what you share, and what you can do. */
export const ProfileCard = ({
  userId,
  guildId,
  onNickname,
  onModerate,
}: {
  userId: Snowflake
  guildId: Snowflake | null
  onNickname: (profile: UserProfile) => void
  onModerate: (profile: UserProfile, kind: ModerationKind) => void
}) => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const status = usePresence(userId)
  const { data: profile, isError } = useQuery(profileQueryOptions(api, userId, guildId))
  const { data: guilds = [] } = useQuery(guildsQueryOptions(api))
  const { data: guild } = useQuery({
    ...guildQueryOptions(api, guildId ?? ''),
    enabled: guildId !== null,
  })

  if (isError) return <p className="p-4 text-sm text-muted">{t('errors.UNKNOWN_USER')}</p>
  if (!profile) return <p className="p-4 text-sm text-muted">{t('common.loading')}</p>

  const { user, member } = profile
  const name = member?.nickname ?? user.displayName ?? user.username
  const roles = (guild?.roles ?? [])
    .filter((role) => member?.roleIds.includes(role.id))
    .sort((a, b) => b.position - a.position)
  const mutualGuilds = guilds.filter((g) => profile.mutualGuildIds.includes(g.id))

  return (
    <div className="flex flex-col">
      <ProfileBanner bannerUrl={profile.bannerUrl} accentColor={profile.accentColor} />
      <div className="flex flex-col gap-4 p-4">
        <header className="flex items-center gap-3">
          <span className="relative">
            <Avatar name={name} src={user.avatarUrl} id={user.id} className="size-16 text-2xl" />
            <span className="absolute right-0 bottom-0">
              <PresenceDot status={status} label={t(`presence.${status}`)} />
            </span>
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{name}</h2>
            <p className="truncate text-sm text-muted">{user.username}</p>
            {status === 'offline' ? null : (
              <CustomStatusLine userId={user.id} wrap className="mt-1 text-sm" />
            )}
          </div>
        </header>

        {profile.bio ? (
          <Section title={t('profile.about')}>
            <p className="text-sm break-words whitespace-pre-wrap">{profile.bio}</p>
          </Section>
        ) : null}

        <Section title={t('profile.memberSince')}>
          <p className="text-sm">
            {t('profile.onChinchi', { date: formatDate(profile.createdAt, i18n.language) })}
            {member ? (
              <>
                <br />
                {t('profile.onServer', { date: formatDate(member.joinedAt, i18n.language) })}
              </>
            ) : null}
          </p>
        </Section>

        {roles.length > 0 ? (
          <Section title={t('profile.roles')}>
            <ul className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className="flex items-center gap-1 rounded bg-elevated px-2 py-0.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full bg-muted"
                    style={role.color ? { backgroundColor: toHexColor(role.color) } : undefined}
                  />
                  {role.name}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {mutualGuilds.length > 0 || profile.mutualFriends.length > 0 ? (
          <Section title={t('profile.shared')}>
            {mutualGuilds.length > 0 ? (
              <p className="text-sm">{mutualGuilds.map((g) => g.name).join(', ')}</p>
            ) : null}
            {profile.mutualFriends.length > 0 ? (
              <p className="text-sm text-muted">
                {t('profile.mutualFriends', { count: profile.mutualFriends.length })}
              </p>
            ) : null}
          </Section>
        ) : null}

        <ProfileActions
          profile={profile}
          guildId={guildId}
          onNickname={() => onNickname(profile)}
        />
        {guildId ? (
          <ModerationActions
            profile={profile}
            guildId={guildId}
            onModerate={(kind) => onModerate(profile, kind)}
          />
        ) : null}
      </div>
    </div>
  )
}
