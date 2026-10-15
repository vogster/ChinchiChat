/**
 * Message markdown as data. Clients render it with their own components; nothing here is HTML,
 * so a renderer that maps nodes to elements cannot inject markup.
 */

export type Snowflake = string

export interface TextNode {
  readonly type: 'text'
  readonly value: string
}

export interface StyledNode {
  readonly type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler'
  readonly children: readonly InlineNode[]
}

export interface InlineCodeNode {
  readonly type: 'inlineCode'
  readonly value: string
}

/** An http(s) URL. `<https://…>` keeps the link but asks for no preview. */
export interface LinkNode {
  readonly type: 'link'
  readonly url: string
  readonly suppressEmbed: boolean
}

export interface MentionNode {
  readonly type: 'userMention' | 'roleMention' | 'channelMention'
  readonly id: Snowflake
}

export interface EveryoneNode {
  readonly type: 'everyone' | 'here'
}

export interface EmojiNode {
  readonly type: 'emoji'
  readonly value: string
}

/** A server's own emoji, written `<:name:id>` (`<a:name:id>` when animated). */
export interface CustomEmojiNode {
  readonly type: 'customEmoji'
  readonly name: string
  readonly id: Snowflake
  readonly animated: boolean
}

export interface LineBreakNode {
  readonly type: 'lineBreak'
}

export type InlineNode =
  | TextNode
  | StyledNode
  | InlineCodeNode
  | LinkNode
  | MentionNode
  | EveryoneNode
  | EmojiNode
  | CustomEmojiNode
  | LineBreakNode

export interface ParagraphNode {
  readonly type: 'paragraph'
  readonly children: readonly InlineNode[]
}

export interface CodeBlockNode {
  readonly type: 'codeBlock'
  readonly lang: string | null
  readonly value: string
}

export interface QuoteNode {
  readonly type: 'quote'
  readonly children: readonly BlockNode[]
}

export type BlockNode = ParagraphNode | CodeBlockNode | QuoteNode

export type MarkdownDocument = readonly BlockNode[]
