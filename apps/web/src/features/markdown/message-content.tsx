import { isEmojiOnly, parseMarkdown } from '@chinchi/markdown'
import { useMemo } from 'react'

import { MarkdownView } from './markdown-view'
import { useMentionResolver } from './mention-context'

import type { ReactNode } from 'react'

export interface MessageContentProps {
  readonly content: string
  /** Shown inline after the text, e.g. the "(edited)" marker. */
  readonly suffix?: ReactNode
  readonly className?: string
}

/** A message's text, parsed once per content change; a few emoji alone are shown large. */
export const MessageContent = ({ content, suffix, className = '' }: MessageContentProps) => {
  const doc = useMemo(() => parseMarkdown(content), [content])
  const resolve = useMentionResolver()
  const jumbo = isEmojiOnly(doc)
  return (
    <div
      data-jumbo={jumbo || undefined}
      className={`break-words ${jumbo ? 'text-5xl leading-tight' : ''} ${className}`}
    >
      {/* Remount on edit, so revealed spoilers hide again over the new text. */}
      <MarkdownView key={content} doc={doc} resolve={resolve} suffix={suffix} />
    </div>
  )
}
