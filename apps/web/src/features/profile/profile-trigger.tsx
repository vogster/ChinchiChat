import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ModerationDialog } from '../moderation/moderation-dialogs'
import { NicknameDialog } from './nickname-dialog'
import { ProfileCard } from './profile-card'

import type { ModerationKind } from '../moderation/moderation-dialogs'
import type { Snowflake, UserProfile } from '@chinchi/shared'
import type { ReactNode } from 'react'

/**
 * Makes anything showing a person (avatar, name, a row) open their profile card on click.
 * `guildId` is the server it was opened from, for roles and nickname; null elsewhere.
 */
export const ProfileTrigger = ({
  userId,
  guildId,
  name,
  label = name,
  className = '',
  side = 'right',
  children,
}: {
  userId: Snowflake
  guildId: Snowflake | null
  /** The person's shown name. */
  name: string
  /** The trigger's accessible name when it says more than the name (status, owner). */
  label?: string
  className?: string
  side?: 'right' | 'left' | 'top' | 'bottom'
  children: ReactNode
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<UserProfile | null>(null)
  const [moderating, setModerating] = useState<ModerationKind | null>(null)

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={label}
          className={`cursor-pointer text-left hover:underline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
        >
          {children}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            role="dialog"
            aria-label={t('profile.label', { name })}
            side={side}
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="z-50 w-80 overflow-y-auto rounded-lg bg-rail text-text shadow-xl"
          >
            {open ? (
              <ProfileCard
                userId={userId}
                guildId={guildId}
                onNickname={(profile) => {
                  setOpen(false)
                  setRenaming(profile)
                }}
                onModerate={(_, kind) => {
                  setOpen(false)
                  setModerating(kind)
                }}
              />
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {renaming && guildId ? (
        <NicknameDialog
          guildId={guildId}
          userId={userId}
          current={renaming.member?.nickname ?? null}
          onOpenChange={(value) => !value && setRenaming(null)}
        />
      ) : null}
      {moderating && guildId ? (
        <ModerationDialog
          kind={moderating}
          guildId={guildId}
          userId={userId}
          name={name}
          onOpenChange={(value) => !value && setModerating(null)}
        />
      ) : null}
    </>
  )
}
