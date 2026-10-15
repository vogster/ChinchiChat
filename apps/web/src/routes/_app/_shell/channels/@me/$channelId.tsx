import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../../../../../components/layout/page-header'
import { DmView } from '../../../../../features/dms/dm-view'
import { dmsQueryOptions } from '../../../../../features/dms/queries'
import { useApi } from '../../../../../lib/api-context'

const DmPage = () => {
  const { t } = useTranslation()
  const { channelId } = Route.useParams()
  const { data: channels, isPending } = useQuery(dmsQueryOptions(useApi()))
  const channel = channels?.find((c) => c.id === channelId)

  if (isPending) return null
  if (!channel) {
    return (
      <>
        <PageHeader>{t('dm.title')}</PageHeader>
        <p className="flex flex-1 items-center justify-center text-muted">{t('dm.notFound')}</p>
      </>
    )
  }
  return <DmView key={channel.id} channel={channel} />
}

export const Route = createFileRoute('/_app/_shell/channels/@me/$channelId')({
  component: DmPage,
})
