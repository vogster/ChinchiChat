import { createFileRoute, redirect } from '@tanstack/react-router'

import { meQueryOptions } from '../../../../features/auth/queries'
import { guildQueryOptions } from '../../../../features/guilds/queries'
import { basePermissions } from '../../../../features/permissions/permissions'
import { allowedSections } from '../../../../features/server-settings/sections'

/** Opens the first section the user may use. */
export const Route = createFileRoute('/_app/server-settings/$guildId/')({
  beforeLoad: async ({ context, params }) => {
    const [guild, me] = await Promise.all([
      context.queryClient.ensureQueryData(guildQueryOptions(context.api, params.guildId)),
      context.queryClient.ensureQueryData(meQueryOptions(context.api)),
    ])
    const section = allowedSections(me ? basePermissions(guild, me.id) : 0n)[0] ?? 'roles'
    throw redirect({ to: `/server-settings/$guildId/${section}`, params, replace: true })
  },
})
