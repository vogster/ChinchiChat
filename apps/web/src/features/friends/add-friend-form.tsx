import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'

import type { RelationshipActions } from './use-relationship-actions'

export const AddFriendForm = ({ request }: { request: RelationshipActions['request'] }) => {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const name = username.trim()
        if (!name) return
        setSentTo(null)
        request.mutate(name, {
          onSuccess: () => {
            setSentTo(name)
            setUsername('')
          },
        })
      }}
    >
      <p className="text-sm text-muted">{t('friends.add.hint')}</p>
      <TextField
        label={t('friends.add.username')}
        value={username}
        autoComplete="off"
        maxLength={32}
        onChange={(event) => setUsername(event.target.value)}
      />
      {request.isError ? <Alert tone="error">{errorMessage(t, request.error)}</Alert> : null}
      {sentTo && !request.isError ? (
        <Alert tone="success">{t('friends.add.sent', { name: sentTo })}</Alert>
      ) : null}
      <div>
        <Button
          type="submit"
          fullWidth={false}
          pending={request.isPending}
          disabled={!username.trim()}
        >
          {t('friends.add.submit')}
        </Button>
      </div>
    </form>
  )
}
