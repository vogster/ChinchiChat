import type { Relationship } from '@chinchi/shared'
import type { TFunction } from 'i18next'

/** How an action shows: a labelled pill, a round icon, or an entry of the "more" menu. */
export type FriendActionKind = 'accent' | 'soft' | 'ghost' | 'secret' | 'call' | 'menu'

export interface FriendAction {
  readonly label: string
  readonly onClick: () => void
  readonly kind: FriendActionKind
  readonly tone?: 'danger'
}

export interface FriendHandlers {
  readonly message: (userId: string) => void
  readonly secret: (userId: string) => void
  /** Absent where voice is not set up. */
  readonly call: ((userId: string) => void) | null
  readonly accept: (userId: string) => void
  readonly block: (userId: string) => void
  readonly remove: (userId: string) => void
}

/** What can be done with someone, by how they relate to the viewer. */
export const friendActions = (
  t: TFunction,
  { user, type }: Relationship,
  h: FriendHandlers,
): FriendAction[] => {
  switch (type) {
    case 'friend':
      return [
        { label: t('friends.message'), onClick: () => h.message(user.id), kind: 'soft' },
        { label: t('friends.secret'), onClick: () => h.secret(user.id), kind: 'secret' },
        ...(h.call
          ? [{ label: t('friends.call'), onClick: () => h.call?.(user.id), kind: 'call' as const }]
          : []),
        {
          label: t('friends.remove'),
          onClick: () => h.remove(user.id),
          kind: 'menu',
          tone: 'danger',
        },
        {
          label: t('friends.block'),
          onClick: () => h.block(user.id),
          kind: 'menu',
          tone: 'danger',
        },
      ]
    case 'pending_in':
      return [
        { label: t('friends.decline'), onClick: () => h.remove(user.id), kind: 'ghost' },
        { label: t('friends.accept'), onClick: () => h.accept(user.id), kind: 'accent' },
        {
          label: t('friends.block'),
          onClick: () => h.block(user.id),
          kind: 'menu',
          tone: 'danger',
        },
      ]
    case 'pending_out':
      return [{ label: t('friends.cancel'), onClick: () => h.remove(user.id), kind: 'ghost' }]
    case 'blocked':
      return [{ label: t('friends.unblock'), onClick: () => h.remove(user.id), kind: 'ghost' }]
  }
}
