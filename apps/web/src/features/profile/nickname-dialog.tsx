import { NICKNAME_MAX_LENGTH } from '@chinchi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { setMemberNickname } from '../guilds/guild-cache'
import { profileKeys } from './queries'

import type { Snowflake } from '@chinchi/shared'

/** A server nickname for yourself or (with MANAGE_NICKNAMES) someone else; empty clears it. */
export const NicknameDialog = ({
  guildId,
  userId,
  current,
  onOpenChange,
}: {
  guildId: Snowflake
  userId: Snowflake
  current: string | null
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState(current ?? '')
  const save = useMutation({
    mutationFn: () => api.guilds.setNickname(guildId, userId, nickname.trim() || null),
    onSuccess: ({ member }) => {
      setMemberNickname(queryClient, guildId, userId, member.nickname)
      void queryClient.invalidateQueries({ queryKey: profileKeys.user(userId) })
      onOpenChange(false)
    },
  })

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('profile.nicknameTitle')}
      description={t('profile.nicknameHint')}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <TextField
          label={t('profile.nickname')}
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(event) => setNickname(event.target.value)}
        />
        {save.isError ? <Alert tone="error">{errorMessage(t, save.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" pending={save.isPending}>
            {t('dm.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
