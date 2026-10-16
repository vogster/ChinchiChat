import { serializePermissions } from '@chinchi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../../lib/api-context'
import { upsertChannel } from '../guild-cache'

import type { OverwriteDraft } from './overwrite-draft'
import type { Channel, PermissionOverwrite, Snowflake } from '@chinchi/shared'

export interface OverwriteTarget {
  readonly id: Snowflake
  readonly type: PermissionOverwrite['targetType']
}

/** Saves and resets one channel's permission overwrites. */
export const useOverwriteActions = (channel: Channel) => {
  const api = useApi()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: ({ target, draft }: { target: OverwriteTarget; draft: OverwriteDraft }) =>
      api.permissions.put(channel.id, target.id, {
        targetType: target.type,
        allow: serializePermissions(draft.allow),
        deny: serializePermissions(draft.deny),
      }),
    onSuccess: ({ channel: updated }) => upsertChannel(queryClient, updated),
  })

  const reset = useMutation({
    mutationFn: (target: OverwriteTarget) => api.permissions.delete(channel.id, target.id),
    onSuccess: (_result, target) =>
      upsertChannel(queryClient, {
        ...channel,
        permissionOverwrites: channel.permissionOverwrites.filter((o) => o.targetId !== target.id),
      }),
  })

  const sync = useMutation({
    mutationFn: () => api.permissions.sync(channel.id),
    onSuccess: ({ channel: updated }) => upsertChannel(queryClient, updated),
  })

  return { save, reset, sync }
}
