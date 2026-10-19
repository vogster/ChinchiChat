import { useApi } from '../../lib/api-context'
import { ReportsList } from '../reports/reports-list'

/** Reports on direct messages, which no server's moderators can see. */
export const AdminReportsSection = () => {
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
