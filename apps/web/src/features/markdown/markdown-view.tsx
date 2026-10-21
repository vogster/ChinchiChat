import { isSafeUrl } from '@chinchi/markdown'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { isQrSignInLink } from '../auth/qr-login-search'
import { CustomEmoji } from '../emoji/custom-emoji'

import type { MentionResolver } from './mention-context'
import type { BlockNode, InlineNode, MarkdownDocument } from '@chinchi/markdown'
import type { ReactNode } from 'react'

const mentionClass = 'rounded bg-accent/15 px-0.5 font-medium text-accent'

/**
 * Hidden behind a box until clicked. The content is `inert` (no focus, out of the accessibility
 * tree) and forced transparent, so links and colored mentions inside cannot show through.
 */
const Spoiler = ({ label, children }: { label: string; children: ReactNode }) => {
  const [revealed, setRevealed] = useState(false)
  if (revealed) return <span className="rounded bg-chip px-0.5">{children}</span>
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => setRevealed(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setRevealed(true)
        }
      }}
      className="cursor-pointer rounded bg-muted px-0.5 select-none"
    >
      <span inert className="text-transparent [&_*]:bg-transparent! [&_*]:text-transparent!">
        {children}
      </span>
    </span>
  )
}

const Inline = ({ node, resolve }: { node: InlineNode; resolve: MentionResolver }) => {
  const children = (nodes: readonly InlineNode[]) =>
    nodes.map((child, index) => <Inline key={index} node={child} resolve={resolve} />)

  switch (node.type) {
    case 'text':
      return node.value
    case 'bold':
      return <strong className="font-semibold">{children(node.children)}</strong>
    case 'italic':
      return <em>{children(node.children)}</em>
    case 'underline':
      return <u>{children(node.children)}</u>
    case 'strike':
      return <s>{children(node.children)}</s>
    case 'spoiler':
      return <Spoiler label={resolve.labels.showSpoiler}>{children(node.children)}</Spoiler>
    case 'inlineCode':
      return (
        <code className="rounded bg-field px-1 py-0.5 font-mono text-[0.85em]">{node.value}</code>
      )
    case 'link':
      if (isQrSignInLink(node.url)) {
        return (
          <span>
            <span className="break-all">{node.url}</span>{' '}
            <span className="text-xs font-medium text-danger">{resolve.labels.qrSignInLink}</span>
          </span>
        )
      }
      // The parser only emits http(s) links; checked again because this is the last line.
      return isSafeUrl(node.url) ? (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-accent hover:underline"
        >
          {node.url}
        </a>
      ) : (
        node.url
      )
    case 'userMention': {
      const name = resolve.user(node.id)
      return <span className={mentionClass}>@{name ?? resolve.labels.unknownUser}</span>
    }
    case 'roleMention': {
      const role = resolve.role(node.id)
      return (
        <span className={mentionClass} style={role?.color ? { color: role.color } : undefined}>
          @{role?.name ?? resolve.labels.unknownRole}
        </span>
      )
    }
    case 'channelMention': {
      const name = resolve.channel(node.id)
      return name ? (
        <Link
          to="/channels/$guildId/$channelId"
          params={{ guildId: resolve.guildId, channelId: node.id }}
          className={`${mentionClass} hover:underline`}
        >
          #{name}
        </Link>
      ) : (
        <span className={mentionClass}>#{resolve.labels.unknownChannel}</span>
      )
    }
    case 'everyone':
      return <span className={mentionClass}>@everyone</span>
    case 'here':
      return <span className={mentionClass}>@here</span>
    case 'emoji':
      return <span className="emoji">{node.value}</span>
    case 'customEmoji':
      return <CustomEmoji id={node.id} name={node.name} className="emoji size-[1.375em]" />
    case 'lineBreak':
      return <br />
  }
}

interface BlockProps {
  readonly node: BlockNode
  readonly resolve: MentionResolver
  /** Appended inline at the end (e.g. "(edited)"). */
  readonly suffix?: ReactNode
}

const Block = ({ node, resolve, suffix }: BlockProps) => {
  switch (node.type) {
    case 'paragraph':
      return (
        <p>
          {node.children.map((child, index) => (
            <Inline key={index} node={child} resolve={resolve} />
          ))}
          {suffix}
        </p>
      )
    case 'codeBlock':
      return (
        <pre className="my-1 overflow-x-auto rounded-md border border-line bg-field p-2 font-mono text-sm">
          <code data-lang={node.lang ?? undefined}>{node.value}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote className="my-0.5 border-l-4 border-line pl-3">
          {node.children.map((child, index) => (
            <Block key={index} node={child} resolve={resolve} />
          ))}
        </blockquote>
      )
  }
}

/** Markdown AST as React elements. No HTML strings anywhere, so content cannot inject markup. */
export const MarkdownView = ({
  doc,
  resolve,
  suffix,
}: {
  doc: MarkdownDocument
  resolve: MentionResolver
  suffix?: ReactNode
}) => {
  const last = doc.at(-1)
  // The suffix joins a closing paragraph; after a code block or quote it gets its own line.
  const inline = last?.type === 'paragraph'
  return (
    <>
      {doc.map((block, index) => (
        <Block
          key={index}
          node={block}
          resolve={resolve}
          suffix={inline && index === doc.length - 1 ? suffix : undefined}
        />
      ))}
      {inline ? null : suffix}
    </>
  )
}
