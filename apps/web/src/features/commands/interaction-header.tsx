import { SquareSlash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMemberNames } from '../guilds/use-member-names'

import type { Message } from '@chinchi/shared'

/** The line above a bot's answer: who ran which command. */
export const InteractionHeader = ({
  interaction,
  guildId,
}: {
  interaction: NonNullable<Message['interaction']>
  guildId: string | null
}) => {
  const { t } = useTranslation()
  const nameOf = useMemberNames(guildId)
  const name = interaction.user ? nameOf(interaction.user) : t('messages.deletedUser')
  return (
    <p className="flex items-center gap-1 text-xs text-muted">
      <SquareSlash aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{t('commands.used', { name, command: interaction.name })}</span>
    </p>
  )
}
