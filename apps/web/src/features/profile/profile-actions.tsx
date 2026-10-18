import { Permission } from '@chinchi/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, Phone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useCurrentUser } from '../auth/use-auth-actions'
import { useOpenDm } from '../dms/use-dm-actions'
import { useOpenDmWith } from '../dms/use-open-dm-with'
import { BetaBadge } from '../e2ee/beta-badge'
import { useRelationshipActions } from '../friends/use-relationship-actions'
import { useOutranks } from '../moderation/use-outranks'
import { can } from '../permissions/permissions'
import { withSettings } from '../settings/settings-search'
import { useVoiceEnabled } from '../voice/use-voice-people'
import { useVoice } from '../voice/voice-context'
import { profileKeys } from './queries'

import type { Snowflake, UserProfile } from '@chinchi/shared'
import type { ReactNode } from 'react'

const ListItem = ({
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`flex h-10 w-full items-center gap-2 px-3.5 text-left text-[13.5px] font-medium transition-colors hover:bg-chip disabled:opacity-60 ${danger ? 'text-danger' : 'text-text'}`}
  >
    {children}
  </button>
)

/** What you can do with someone from their card: message or call, befriend, block, rename. */
export const ProfileActions = ({
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
  const voice = useVoice()
  const voiceEnabled = useVoiceEnabled()
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
          to="."
          search={withSettings('profile')}
          className="flex h-10 items-center justify-center rounded-full bg-field text-sm font-medium transition-colors hover:bg-chip"
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
  const blocked = relationship === 'blocked'
  const call = () => {
    if (shared) {
      void voice.join(null, shared.id)
      return
    }
    // Not mutate's onSuccess: the card closes as the DM opens, and that callback would be dropped.
    void openDm
      .mutateAsync([profile.user.id])
      .then(({ channel }) => voice.join(null, channel.id))
      .catch(() => undefined)
  }

  return (
    <div className="flex flex-col gap-2">
      {blocked ? null : (
        <div className="flex gap-2">
          {!shared || shared.encrypted ? (
            <Button onClick={() => openDm.mutate([profile.user.id])} pending={openDm.isPending}>
              {t('friends.message')}
            </Button>
          ) : null}
          {voiceEnabled ? (
            <button
              type="button"
              aria-label={t('voice.call')}
              title={t('voice.call')}
              onClick={call}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-field text-muted transition-colors hover:bg-chip hover:text-text"
            >
              <Phone aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      )}
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
      <div className="flex flex-col overflow-hidden rounded-tile bg-field">
        {!blocked && !shared?.encrypted ? (
          <ListItem
            disabled={openDm.isPending}
            onClick={() => openDm.mutate({ ids: [profile.user.id], encrypted: true })}
          >
            <Lock aria-hidden className="size-4 shrink-0 text-secure-text" />
            <span className="flex-1">{t('e2ee.start')}</span>
            <BetaBadge />
          </ListItem>
        ) : null}
        {canRename ? <ListItem onClick={onNickname}>{t('profile.changeNickname')}</ListItem> : null}
        {blocked ? (
          <ListItem onClick={() => actions.remove.mutate(profile.user.id, refresh)}>
            {t('friends.unblock')}
          </ListItem>
        ) : (
          <ListItem danger onClick={() => actions.block.mutate(profile.user.id, refresh)}>
            {t('friends.block')}
          </ListItem>
        )}
      </div>
    </div>
  )
}
