import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useE2ee } from './e2ee-context'
import { PendingMembers } from './pending-members'

import type { EncryptedChannel } from './client'

const membershipKey = (channelId: string, revision: number) =>
  ['e2ee', 'membership', channelId, revision] as const

export interface GroupNoticesProps {
  readonly channel: EncryptedChannel
  readonly nameOf: (userId: string) => string
  readonly onCheck: () => void
}

/**
 * Who came into an encrypted group by a member's commit (compare codes with them before
 * anything important), and who the server lists but is not in the encryption yet: messages
 * don't reach them until a member takes them in.
 */
export const GroupNotices = ({ channel, nameOf, onCheck }: GroupNoticesProps) => {
  const { t } = useTranslation()
  const { client, revision } = useE2ee()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: membershipKey(channel.id, revision),
    queryFn: () => client?.membership(channel) ?? { notices: [], pending: [] },
    enabled: client !== null,
  })
  if (!data) return null

  const dismiss = async (noticeId: string) => {
    await client?.dismissNotice(channel.id, noticeId)
    await queryClient.invalidateQueries({ queryKey: ['e2ee', 'membership', channel.id] })
  }

  // Opening the conversation again adds their devices now, not on the next message.
  const takeIn = async (userId: string) => {
    if (!client) return
    await client.invited(channel.id, [userId])
    await client.open(channel)
    await queryClient.invalidateQueries({ queryKey: ['e2ee', 'membership', channel.id] })
  }

  return (
    <>
      {data.notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          aria-label={t('e2ee.members.newTitle')}
          className="mx-4 mt-2 flex items-start gap-3.5 rounded-[24px] bg-stage p-4 text-sm"
        >
          <span className="grid size-[42px] shrink-0 place-items-center rounded-[15px] bg-secure-soft text-secure-text">
            <UserPlus aria-hidden className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <p className="font-semibold">
              {t('e2ee.members.new', { names: notice.userIds.map(nameOf).join(', ') })}
            </p>
            <p className="text-muted">
              {notice.byUserId ? t('e2ee.members.by', { name: nameOf(notice.byUserId) }) : null}{' '}
              {t('e2ee.members.compare')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button fullWidth={false} onClick={onCheck}>
                {t('e2ee.members.check')}
              </Button>
              <Button variant="secondary" fullWidth={false} onClick={() => void dismiss(notice.id)}>
                {t('e2ee.members.dismiss')}
              </Button>
            </div>
          </div>
        </div>
      ))}
      {data.pending.length > 0 ? (
        <PendingMembers userIds={data.pending} nameOf={nameOf} onTakeIn={takeIn} />
      ) : null}
    </>
  )
}
