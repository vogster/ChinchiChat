import { CHANNEL_NAME_MAX_LENGTH, normalizeTextChannelName } from '@chinchi/shared'
import { Hash, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { TextField } from '../../../components/ui/text-field'
import { errorMessage } from '../../../lib/errors'
import { useCreateChannel } from '../use-guild-actions'

import type { Channel, Snowflake } from '@chinchi/shared'

export interface CreateChannelDialogProps {
  readonly guildId: Snowflake
  readonly initialType: 'text' | 'category'
  readonly parent: Channel | null
  readonly onOpenChange: (open: boolean) => void
}

const typeOptionClass =
  'flex cursor-pointer items-center gap-3 rounded-md bg-sidebar px-3 py-2.5 hover:bg-hover has-[:checked]:bg-hover has-[:checked]:outline-2 has-[:checked]:outline-accent'

export const CreateChannelDialog = ({
  guildId,
  initialType,
  parent,
  onOpenChange,
}: CreateChannelDialogProps) => {
  const { t } = useTranslation()
  const isCategory = initialType === 'category'
  const [type, setType] = useState<'text' | 'voice'>('text')
  const [name, setName] = useState('')
  const create = useCreateChannel(guildId)

  const finalType = isCategory ? 'category' : type
  const normalized = finalType === 'text' ? normalizeTextChannelName(name) : name.trim()
  const valid = normalized.length > 0 && normalized.length <= CHANNEL_NAME_MAX_LENGTH

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={isCategory ? t('createChannel.categoryTitle') : t('createChannel.title')}
      description={parent ? t('createChannel.inCategory', { name: parent.name }) : undefined}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          create.mutate(
            { type: finalType, name, parentId: isCategory ? null : (parent?.id ?? null) },
            { onSuccess: () => onOpenChange(false) },
          )
        }}
      >
        {create.isError ? <Alert tone="error">{errorMessage(t, create.error)}</Alert> : null}

        {isCategory ? null : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
              {t('createChannel.type')}
            </legend>
            {(
              [
                ['text', Hash, t('createChannel.text'), t('createChannel.textHint')],
                ['voice', Volume2, t('createChannel.voice'), t('createChannel.voiceHint')],
              ] as const
            ).map(([value, Icon, label, hint]) => (
              <label key={value} className={typeOptionClass}>
                <Icon aria-hidden className="size-5 text-muted" />
                <span className="flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
                <input
                  type="radio"
                  name="channel-type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                />
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <TextField
            label={isCategory ? t('createChannel.categoryName') : t('createChannel.name')}
            value={name}
            autoFocus
            maxLength={CHANNEL_NAME_MAX_LENGTH * 2}
            onChange={(event) => setName(event.target.value)}
          />
          {finalType === 'text' && name && normalized !== name ? (
            <p className="text-xs text-muted">
              {t('createChannel.preview', { name: `#${normalized}` })}
            </p>
          ) : null}
        </div>

        <Button type="submit" pending={create.isPending} disabled={!valid}>
          {t('createChannel.submit')}
        </Button>
      </form>
    </Dialog>
  )
}
