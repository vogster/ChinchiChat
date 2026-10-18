import { createFileRoute } from '@tanstack/react-router'

import { redirectToServerSettings } from '../../../../features/server-settings/open-server-settings'

/** The settings open over the chat now; old links land there. */
export const Route = createFileRoute('/_app/server-settings/$guildId/')({
  beforeLoad: ({ context, params }) => redirectToServerSettings(context, params.guildId, undefined),
})
