import { MESSAGE_MAX_LENGTH } from '@chinchi/shared'
import { ArrowUp, AtSign, Mic, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CommandSuggestions } from '../commands/command-suggestions'
import { parseCommand, suggestCommands } from '../commands/parse-command'
import { EmojiPicker } from '../emoji/emoji-picker'
import { MentionSuggestions } from '../mentions/mention-suggestions'
import { useMentionSuggestions } from '../mentions/use-mention-suggestions'
import { RecordingBar } from '../voice-messages/recording-bar'
import { pickRecordingFormat } from '../voice-messages/recording-format'
import { useVoiceRecorder } from '../voice-messages/use-voice-recorder'
import { ComposerMenu } from './composer-menu'
import { CreatePollDialog } from './create-poll-dialog'

import type { EmojiPickerProps } from '../emoji/emoji-picker'
import type { MentionCandidate } from '../mentions/mention-query'
import type { Command, Snowflake } from '@chinchi/shared'
import type { KeyboardEvent } from 'react'

export interface ComposerProps {
  readonly channelName: string
  /** Overrides the "#channel" wording, e.g. "@bob" in a DM. */
  readonly placeholder?: string | undefined
  readonly onSend: (content: string) => void
  readonly onTyping: () => void
  /** Up arrow in an empty composer edits your last message. */
  readonly onEditLast: () => void
  /** The message being answered, if any. */
  readonly reply?: ComposerReply | null
  /** Attaching files; absent without ATTACH_FILES or object storage. */
  readonly attach?: ComposerAttach | null
  /** The server's own emoji for the picker. */
  readonly customEmojis?: EmojiPickerProps['custom']
  /** Slowmode, when it applies to the sender: holds messages back while `wait` runs. */
  readonly slowmode?: { readonly seconds: number; readonly wait: number } | null
  /** Slash commands of the server's bots: `/name` runs one instead of sending text. */
  readonly commands?: ComposerCommands | null
  /** Where a poll from the composer goes; absent where polls don't work (encrypted). */
  readonly pollChannelId?: Snowflake | null
  /** What `@` and `#` suggest: people, roles, channels. */
  readonly mentions?: readonly MentionCandidate[] | null
  /** Voice messages: the microphone button records one and sends it as a file. */
  readonly voice?: ComposerVoice | null
}

export interface ComposerVoice {
  readonly onSend: (file: File) => void
}

export interface ComposerCommands {
  readonly list: readonly Command[]
  readonly onRun: (commandId: string, options: Record<string, string>) => void
  /** Asks for the list again: a bot may have registered commands since the channel opened. */
  readonly refresh?: () => void
}

export interface ComposerAttach {
  /** How many files wait to be sent (a message may then have no text). */
  readonly count: number
  readonly onAdd: (files: File[]) => void
}

export interface ComposerReply {
  /** The answered message; focus moves to the composer whenever it changes. */
  readonly messageId: string
  readonly authorName: string
  readonly mention: boolean
  readonly onToggleMention: () => void
  readonly onCancel: () => void
}

const ReplyBar = ({ reply }: { reply: ComposerReply }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 rounded-t-composer bg-stage py-2 pr-2 pl-4 text-[12.5px] text-faint">
      <span className="min-w-0 flex-1 truncate">
        {t('messages.replyingTo', { name: reply.authorName })}
      </span>
      <button
        type="button"
        aria-pressed={reply.mention}
        aria-label={t('messages.replyMention')}
        title={t('messages.replyMention')}
        onClick={reply.onToggleMention}
        className="flex h-7 items-center gap-0.5 rounded-full px-2.5 text-xs font-semibold hover:bg-field aria-pressed:text-accent-text"
      >
        <AtSign aria-hidden className="size-3.5" />
        {reply.mention ? t('messages.replyMentionOn') : t('messages.replyMentionOff')}
      </button>
      <button
        type="button"
        aria-label={t('messages.cancelReply')}
        title={t('messages.cancelReply')}
        onClick={reply.onCancel}
        className="grid size-7 place-items-center rounded-full hover:bg-field hover:text-text"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

const COUNTER_FROM = MESSAGE_MAX_LENGTH - 200

export const Composer = ({
  channelName,
  placeholder,
  onSend,
  onTyping,
  onEditLast,
  reply = null,
  attach = null,
  customEmojis = null,
  slowmode = null,
  commands = null,
  pollChannelId = null,
  mentions = null,
  voice = null,
}: ComposerProps) => {
  const { t } = useTranslation()
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [value, setValue] = useState('')
  const [missing, setMissing] = useState<readonly string[]>([])
  const [active, setActive] = useState(0)
  const suggestions = commands ? suggestCommands(value, commands.list) : []
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const recorder = useVoiceRecorder((file) => voice?.onSend(file))
  const [canRecord] = useState(() => pickRecordingFormat() !== null)
  const { stop } = recorder
  const cancelRecording = useCallback(() => stop(false), [stop])
  const sendRecording = useCallback(() => stop(true), [stop])
  const mention = useMentionSuggestions({
    value,
    candidates: mentions,
    ref,
    onChange: (next) => change(next),
  })

  // Starting a reply (from the message's toolbar) continues in the composer.
  const replyId = reply?.messageId
  useEffect(() => {
    if (replyId) ref.current?.focus()
  }, [replyId])

  // Grow with the content up to a limit, then scroll.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`
  }, [value])

  const change = (next: string) => {
    // Entering a command (typed or pasted): a bot may have registered new ones meanwhile.
    if (next.startsWith('/') && !value.startsWith('/')) commands?.refresh?.()
    setValue(next)
    setMissing([])
    setActive(0)
  }

  const pick = (command: Command) => {
    change(`/${command.name} `)
    ref.current?.focus()
  }

  /** A known `/command` runs instead of being sent; true when it took the text. */
  const runCommand = (): boolean => {
    const parsed = commands ? parseCommand(mention.encode(value), commands.list) : null
    if (!commands || !parsed) return false
    if (parsed.missing.length > 0) {
      setMissing(parsed.missing)
      return true
    }
    commands.onRun(parsed.command.id, parsed.options)
    change('')
    mention.reset()
    return true
  }

  const submit = () => {
    if (runCommand()) return
    const empty = value.trim() === '' && (attach?.count ?? 0) === 0
    if (empty || value.length > MESSAGE_MAX_LENGTH || (slowmode?.wait ?? 0) > 0) return
    onSend(mention.encode(value))
    setValue('')
    mention.reset()
  }

  /** Arrows move through the suggested commands; Enter or Tab picks one. */
  const onSuggestionKey = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const count = suggestions.length
    const picked = suggestions[active]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setActive((active + (event.key === 'ArrowDown' ? 1 : count - 1)) % count)
    } else if (event.key === 'Enter' && value === `/${picked?.name}`) {
      // The whole name is typed: Enter runs it (or names what it still needs).
      return false
    } else if ((event.key === 'Enter' || event.key === 'Tab') && picked && !event.shiftKey) {
      pick(picked)
    } else if (event.key === 'Escape') {
      change('')
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.onKey(event)) return
    if (suggestions.length > 0 && onSuggestionKey(event)) return
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    } else if (event.key === 'ArrowUp' && value === '') {
      event.preventDefault()
      onEditLast()
    } else if (event.key === 'Escape' && reply) {
      event.preventDefault()
      reply.onCancel()
    }
  }

  /** Puts the emoji where the cursor was, then puts the cursor after it. */
  const insert = (emoji: string) => {
    const element = ref.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    setValue(value.slice(0, start) + emoji + value.slice(end))
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const left = MESSAGE_MAX_LENGTH - value.length
  // Nothing typed and no files: the send button becomes the microphone.
  const showMic = voice !== null && canRecord && value.trim() === '' && (attach?.count ?? 0) === 0

  return (
    <div className="px-3 pb-3 md:px-4">
      {mention.matches.length > 0 ? (
        <MentionSuggestions
          candidates={mention.matches}
          active={mention.active}
          onPick={mention.pick}
        />
      ) : suggestions.length > 0 ? (
        <CommandSuggestions commands={suggestions} active={active} onPick={pick} />
      ) : null}
      {reply ? <ReplyBar reply={reply} /> : null}
      <div
        className={`flex items-end gap-2 bg-field p-1.5 ${reply ? 'rounded-b-composer' : 'rounded-composer'}`}
      >
        {recorder.recording ? (
          <RecordingBar
            seconds={recorder.seconds}
            level={recorder.level}
            onCancel={cancelRecording}
            onSend={sendRecording}
          />
        ) : null}
        {recorder.recording ? null : attach ? (
          <input
            ref={fileInput}
            type="file"
            multiple
            aria-label={t('messages.attachFiles')}
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              attach.onAdd([...(event.target.files ?? [])])
              // Picking the same file again should work.
              event.target.value = ''
            }}
          />
        ) : null}
        {!recorder.recording && (attach || pollChannelId) ? (
          <ComposerMenu
            onPickFiles={attach ? () => fileInput.current?.click() : null}
            onCreatePoll={pollChannelId ? () => setCreatingPoll(true) : null}
          />
        ) : null}
        <textarea
          ref={ref}
          hidden={recorder.recording}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (!attach || files.length === 0) return
            event.preventDefault()
            attach.onAdd(files)
          }}
          rows={1}
          value={value}
          aria-label={placeholder ?? t('messages.composerLabel', { name: channelName })}
          placeholder={placeholder ?? t('messages.placeholder', { name: channelName })}
          onChange={(event) => {
            change(event.target.value)
            mention.track()
            if (event.target.value) onTyping()
          }}
          onSelect={mention.track}
          onKeyDown={onKeyDown}
          className="max-h-60 min-h-[38px] flex-1 resize-none self-center bg-transparent px-1.5 py-[9px] leading-5 outline-none placeholder:truncate placeholder:text-faint"
        />
        {recorder.recording ? null : (
          <EmojiPicker
            label={t('emoji.picker')}
            trigger={<Smile aria-hidden className="size-5" />}
            triggerClassName="grid size-[38px] shrink-0 place-items-center self-end rounded-full text-muted transition-colors hover:bg-stage hover:text-text"
            onSelect={insert}
            custom={customEmojis}
          />
        )}
        {recorder.recording ? null : showMic ? (
          <button
            type="button"
            aria-label={t('voiceMessage.record')}
            title={t('voiceMessage.record')}
            onClick={() => void recorder.start()}
            className="grid size-[38px] shrink-0 place-items-center self-end rounded-full bg-accent text-accent-contrast transition hover:brightness-110"
          >
            <Mic aria-hidden className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('messages.sendMessage')}
            title={t('messages.sendMessage')}
            onClick={submit}
            className="flex h-[38px] min-w-[38px] shrink-0 items-center justify-center gap-1.5 self-end rounded-full bg-accent text-accent-contrast transition hover:brightness-110 md:px-4"
          >
            <ArrowUp aria-hidden className="size-5 md:hidden" />
            <span aria-hidden className="hidden text-[13px] font-semibold md:inline">
              {t('messages.send')}
            </span>
          </button>
        )}
        {value.length >= COUNTER_FROM ? (
          <span
            className={`self-center text-xs ${left < 0 ? 'text-danger' : 'text-faint'}`}
            aria-live="polite"
          >
            {t('messages.tooLong', { count: left })}
          </span>
        ) : null}
      </div>
      {recorder.error ? (
        <p className="mt-1 px-3 text-xs text-danger" role="alert">
          {t(recorder.error === 'denied' ? 'voiceMessage.denied' : 'voiceMessage.failed')}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="mt-1 px-3 text-xs text-danger" role="alert">
          {t('commands.missing', { options: missing.join(', ') })}
        </p>
      ) : null}
      {slowmode && slowmode.seconds > 0 ? (
        <p className="mt-1 px-3 text-xs text-faint" aria-live="polite">
          {slowmode.wait > 0
            ? t('messages.slowmodeWait', { seconds: slowmode.wait })
            : t('messages.slowmode', { seconds: slowmode.seconds })}
        </p>
      ) : null}
      {creatingPoll && pollChannelId ? (
        <CreatePollDialog channelId={pollChannelId} onOpenChange={setCreatingPoll} />
      ) : null}
    </div>
  )
}
