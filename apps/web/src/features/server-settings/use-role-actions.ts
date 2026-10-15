import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { removeRole, setMemberRoles, upsertRoles } from '../guilds/guild-cache'

import type { ReorderRolesRequest, Snowflake, UpdateRoleRequest } from '@chinchi/shared'

/** Role mutations; each writes its result to the cache without waiting for the gateway echo. */
export const useRoleActions = (guildId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: () => api.roles.create(guildId),
    // Creating shifts every other role up; refetching the list keeps positions exact.
    onSuccess: async ({ role }) => {
      upsertRoles(queryClient, guildId, [role])
      const { roles } = await api.roles.list(guildId)
      upsertRoles(queryClient, guildId, roles)
    },
  })

  const update = useMutation({
    mutationFn: ({ roleId, body }: { roleId: Snowflake; body: UpdateRoleRequest }) =>
      api.roles.update(guildId, roleId, body),
    onSuccess: ({ role }) => upsertRoles(queryClient, guildId, [role]),
  })

  const remove = useMutation({
    mutationFn: (roleId: Snowflake) => api.roles.delete(guildId, roleId),
    onSuccess: (_result, roleId) => removeRole(queryClient, guildId, roleId),
  })

  /** New positions for some roles (see planRoleMove). */
  const reorder = useMutation({
    mutationFn: (items: ReorderRolesRequest) => api.roles.reorder(guildId, items),
    onSuccess: ({ roles }) => upsertRoles(queryClient, guildId, roles),
  })

  const assign = useMutation({
    mutationFn: ({ userId, roleId }: { userId: Snowflake; roleId: Snowflake }) =>
      api.roles.addToMember(guildId, userId, roleId),
    onSuccess: (_result, { userId, roleId }) =>
      setMemberRoles(queryClient, guildId, userId, (ids) =>
        ids.includes(roleId) ? [...ids] : [...ids, roleId],
      ),
  })

  const unassign = useMutation({
    mutationFn: ({ userId, roleId }: { userId: Snowflake; roleId: Snowflake }) =>
      api.roles.removeFromMember(guildId, userId, roleId),
    onSuccess: (_result, { userId, roleId }) =>
      setMemberRoles(queryClient, guildId, userId, (ids) => ids.filter((id) => id !== roleId)),
  })

  return { create, update, remove, reorder, assign, unassign }
}
