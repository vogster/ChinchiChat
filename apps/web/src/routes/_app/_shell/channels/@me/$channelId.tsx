import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Lock, MessageCircleOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../../../../components/layout/main-card'
import { PageHeader, PageTitle } from '../../../../../components/layout/page-header'
import { wasDeleted } from '../../../../../features/dms/deleted-dms'
import { DmView } from '../../../../../features/dms/dm-view'
import { dmsQueryOptions } from '../../../../../features/dms/queries'
import { useApi } from '../../../../../lib/api-context'

/** In place of a DM that is gone (deleted for everyone) or was never there. */
const MissingDm = ({ deleted }: { deleted: boolean }) => {
  const { t } = useTranslation()
  return (
    <MainCard>
      <PageHeader>
        <PageTitle glyph="@" title={t('dm.title')} />
      </PageHeader>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span
          aria-hidden
          className={`grid size-14 place-items-center rounded-[18px] ${deleted ? 'bg-secure-soft text-secure-text' : 'bg-field text-muted'}`}
        >
          {deleted ? <Lock className="size-6" /> : <MessageCircleOff className="size-6" />}
        </span>
        <h2 className="text-lg font-semibold">{deleted ? t('dm.deleted') : t('dm.notFound')}</h2>
        <Link
          to="/"
          className="flex h-10 items-center rounded-full bg-field px-5 font-medium hover:bg-chip"
        >
          {t('dm.backToFriends')}
        </Link>
      </div>
    </MainCard>
  )
}

const DmPage = () => {
  const { channelId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: channels, isPending } = useQuery(dmsQueryOptions(useApi()))
  const channel = channels?.find((c) => c.id === channelId)

  if (isPending) return null
  if (!channel) return <MissingDm deleted={wasDeleted(queryClient, channelId)} />
  return <DmView key={channel.id} channel={channel} />
}

export const Route = createFileRoute('/_app/_shell/channels/@me/$channelId')({
  component: DmPage,
})
