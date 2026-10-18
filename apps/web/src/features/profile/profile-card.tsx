import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { useApi } from '../../lib/api-context'
import { GuildIcon } from '../guilds/guild-icon'
import { guildQueryOptions, guildsQueryOptions } from '../guilds/queries'
import { usePresence } from '../messages/use-presence'
import { ModerationActions } from '../moderation/moderation-actions'
import { toHexColor } from '../permissions/permissions'
import { CustomStatusLine } from '../presence/custom-status-line'
import { ProfileActions } from './profile-actions'
import { ProfileBanner } from './profile-banner'
import { profileQueryOptions } from './queries'

import type { ModerationKind } from '../moderation/moderation-dialogs'
import type { Snowflake, UserProfile } from '@chinchi/shared'

const formatDate = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  )

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-1">
    <h3 className="text-xs font-medium text-faint">{title}</h3>
    {children}
  </section>
)

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
    <div className="flex flex-col p-2">
      <ProfileBanner
        bannerUrl={profile.bannerUrl}
        accentColor={profile.accentColor}
        className="h-[100px] rounded-[24px]"
      />
      <div className="flex flex-col gap-3.5 px-2.5 pb-2">
        <header className="flex flex-col gap-2">
          <div className="-mt-[46px] flex items-end gap-2">
            <span className="relative shrink-0 rounded-[30px] border-[5px] border-side bg-side">
              <Avatar
                name={name}
                src={user.avatarUrl}
                id={user.id}
                rounded="rounded-[26px]"
                className="size-[84px] text-3xl"
              />
              <PresenceDot status={status} label={t(`presence.${status}`)} />
            </span>
            {status === 'offline' ? null : (
              <CustomStatusLine
                userId={user.id}
                className="mb-1 min-w-0 rounded-full bg-field px-2.5 py-1 text-xs text-muted"
              />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[21px] font-semibold tracking-[-0.015em]">{name}</h2>
            <p className="truncate text-[13px] text-faint">
              @<span>{user.username}</span> · {t(`presence.${status}`)}
            </p>
          </div>
          {roles.length > 0 ? (
            <ul aria-label={t('profile.roles')} className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className="flex h-6 items-center gap-1.5 rounded-full bg-field px-2.5 text-xs font-medium"
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-muted"
                    style={role.color ? { backgroundColor: toHexColor(role.color) } : undefined}
                  />
                  {role.name}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {profile.bio ? (
          <p className="text-sm break-words whitespace-pre-wrap text-body">{profile.bio}</p>
        ) : null}

        <div className="flex flex-col gap-3 rounded-tile bg-stage p-3.5">
          <Section title={t('profile.memberSince')}>
            <p className="text-[13px]">
              {t('profile.onChinchi', { date: formatDate(profile.createdAt, i18n.language) })}
              {member ? (
                <>
                  <br />
                  {t('profile.onServer', { date: formatDate(member.joinedAt, i18n.language) })}
                </>
              ) : null}
            </p>
          </Section>
          {mutualGuilds.length > 0 || profile.mutualFriends.length > 0 ? (
            <Section title={t('profile.shared')}>
              {mutualGuilds.length > 0 ? (
                <ul className="flex flex-wrap gap-1">
                  {mutualGuilds.map((g) => (
                    <li
                      key={g.id}
                      className="flex h-7 items-center gap-1.5 rounded-full bg-field pr-2.5 pl-1 text-xs font-medium"
                    >
                      <span className="size-5 overflow-hidden rounded-[7px] text-[9px]">
                        <GuildIcon
                          id={g.id}
                          name={g.name}
                          iconUrl={g.iconUrl}
                          className="text-[9px]"
                        />
                      </span>
                      {g.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {profile.mutualFriends.length > 0 ? (
                <p className="text-xs text-faint">
                  {t('profile.mutualFriends', { count: profile.mutualFriends.length })}
                </p>
              ) : null}
            </Section>
          ) : null}
        </div>

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
