import { createFileRoute } from '@tanstack/react-router'

import { redirectToServerSettings } from '../../../../features/server-settings/open-server-settings'
import { isServerSettingsSection } from '../../../../features/server-settings/sections'

/** Old links (/server-settings/<id>/roles) open that section over the server's chat. */
export const Route = createFileRoute('/_app/server-settings/$guildId/$section')({
  beforeLoad: ({ context, params }) =>
    redirectToServerSettings(
      context,
      params.guildId,
      isServerSettingsSection(params.section) ? params.section : undefined,
    ),
})
