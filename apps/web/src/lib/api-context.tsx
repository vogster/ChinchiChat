import { createContext, useContext } from 'react'

import type { ApiClient } from '@chinchi/sdk'
import type { ReactNode } from 'react'

const ApiContext = createContext<ApiClient | null>(null)

export const ApiProvider = ({ api, children }: { api: ApiClient; children: ReactNode }) => (
  <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
)

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useApi = (): ApiClient => {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
