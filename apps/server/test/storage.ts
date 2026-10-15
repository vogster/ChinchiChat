import { inject } from 'vitest'

import type { StorageConfig } from '../src/config/env'

export const TEST_WEB_ORIGIN = 'http://localhost:5173'

/** Credentials of the throwaway RustFS container (see `test/database.ts`). */
export const TEST_STORAGE = Object.freeze({
  region: 'us-east-1',
  bucket: 'chinchi-test',
  accessKey: 'chinchi-test',
  secretKey: 'chinchi-test-secret',
  forcePathStyle: true,
  encryption: false,
})

/** Storage config of the shared integration RustFS container. */
export const testStorageConfig = (): StorageConfig => {
  const endpoint = inject('s3Endpoint')
  return { ...TEST_STORAGE, endpoint, publicUrl: endpoint }
}
