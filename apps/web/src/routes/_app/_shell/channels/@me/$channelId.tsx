import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../../../../components/layout/main-card'
import { PageHeader } from '../../../../../components/layout/page-header'
import { wasDeleted } from '../../../../../features/dms/deleted-dms'
import { DmView } from '../../../../../features/dms/dm-view'
import { dmsQueryOptions } from '../../../../../features/dms/queries'
import { useApi } from '../../../../../lib/api-context'

const DmPage = () => {
  const { t } = useTranslation()
  const { channelId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: channels, isPending } = useQuery(dmsQueryOptions(useApi()))
  const channel = channels?.find((c) => c.id === channelId)

  if (isPending) return null
  if (!channel) {
    return (
      <MainCard>
        <PageHeader>{t('dm.title')}</PageHeader>
        <p className="flex flex-1 items-center justify-center text-muted">
          {wasDeleted(queryClient, channelId) ? t('dm.deleted') : t('dm.notFound')}
        </p>
      </MainCard>
    )
  }
  return <DmView key={channel.id} channel={channel} />
}

export const Route = createFileRoute('/_app/_shell/channels/@me/$channelId')({
  component: DmPage,
})
