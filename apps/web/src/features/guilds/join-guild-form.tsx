import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { GuildIcon } from './guild-icon'
import { parseInviteCode } from './invite-link'
import { inviteQueryOptions } from './queries'

import type { useAcceptInvite } from './use-guild-actions'

/** Looks the invite up once typing pauses, not on every key. */
const useSettledCode = (link: string) => {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setCode(parseInviteCode(link)), 300)
    return () => clearTimeout(timer)
  }, [link])
  return code
}

/** Joining by an invite link or code: the server it leads to shows before you join. */
export const JoinGuildForm = ({
  join,
  onJoined,
}: {
  join: ReturnType<typeof useAcceptInvite>
  onJoined: () => void
}) => {
  const { t } = useTranslation()
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const code = useSettledCode(link)
  const invite = useQuery({
    ...inviteQueryOptions(useApi(), code ?? ''),
    enabled: code !== null,
    retry: false,
  })
  const found = code !== null ? invite.data : undefined

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = parseInviteCode(link)
        if (!parsed) {
          setLinkError(t('createGuild.invalidLink'))
          return
        }
        setLinkError(null)
        join.mutate(parsed, { onSuccess: onJoined })
      }}
    >
      <TextField
        label={t('createGuild.joinLabel')}
        placeholder={t('createGuild.joinPlaceholder')}
        value={link}
        error={
          linkError ?? (code !== null && invite.isError ? t('createGuild.notFound') : undefined)
        }
        onChange={(event) => {
          setLink(event.target.value)
          setLinkError(null)
        }}
      />
      {found ? (
        <div
          role="group"
          aria-label={found.guild.name}
          className="flex items-center gap-3 rounded-card bg-stage p-3"
        >
          <span className="size-12 shrink-0 overflow-hidden rounded-tile">
            <GuildIcon id={found.guild.id} name={found.guild.name} iconUrl={found.guild.iconUrl} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{found.guild.name}</span>
            <span className="block text-[12.5px] text-faint">
              {t('invite.memberCount', { count: found.guild.memberCount })}
            </span>
          </span>
        </div>
      ) : null}
      <Button type="submit" pending={join.isPending}>
        {t('createGuild.join')}
      </Button>
    </form>
  )
}
