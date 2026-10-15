import { createFileRoute } from '@tanstack/react-router'

import { ReportsList } from '../../features/reports/reports-list'
import { useApi } from '../../lib/api-context'

const AdminReportsPage = () => {
  const api = useApi()
  return (
    <ReportsList
      scope={['admin']}
      load={(status) => api.reports.direct({ status })}
      close={(reportId, status) => api.reports.closeDirect(reportId, status)}
      canDeleteMessages={false}
    />
  )
}

export const Route = createFileRoute('/admin/reports')({ component: AdminReportsPage })
