import {
  attachmentUploadSchema,
  mentionCountsSchema,
  messageSchema,
  pollSchema,
  publicUserSchema,
  readStateSchema,
  searchResultSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { describeFile } from './upload'
import { id, queryString } from './url'

import type { Http } from './http'
import type { PutFile, UploadOptions } from './upload'
import type {
  CreateAttachmentRequest,
  CreateMessageRequest,
  ListMessagesQuery,
  PollVotersQuery,
  SearchMessagesQuery,
  Snowflake,
} from '@chinchi/shared'

const messageResult = z.object({ message: messageSchema })
const messagesResult = z.object({ messages: z.array(messageSchema) })
const pollResult = z.object({ poll: pollSchema })
const attachmentResult = z.object({ attachment: attachmentUploadSchema })
const reactionPath = (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
  `/channels/${id(channelId)}/messages/${id(messageId)}/reactions/${id(emoji)}`

/** Messages and what hangs off them: files, pins, polls, reactions, search. */
export const createMessagesApi = (request: Http, putFile: PutFile) => {
  const createAttachment = (channelId: Snowflake, body: CreateAttachmentRequest) =>
    request({
      method: 'POST',
      path: `/channels/${id(channelId)}/attachments`,
      body,
      data: attachmentResult,
    })

  return {
    messages: {
      list: (channelId: Snowflake, query: ListMessagesQuery = {}) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/messages${queryString(query)}`,
          data: messagesResult,
        }),
      create: (channelId: Snowflake, body: CreateMessageRequest) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/messages`,
          body,
          data: messageResult,
        }),
      /** New text, or in an encrypted conversation `{ ciphertext }`. */
      update: (
        channelId: Snowflake,
        messageId: Snowflake,
        change: string | { readonly ciphertext: string },
      ) =>
        request({
          method: 'PATCH',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}`,
          body: typeof change === 'string' ? { content: change } : change,
          data: messageResult,
        }),
      delete: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'DELETE', path: `/channels/${id(channelId)}/messages/${id(messageId)}` }),
      ack: (channelId: Snowflake, messageId: Snowflake) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}/ack`,
        }),
      typing: (channelId: Snowflake) =>
        request({ method: 'POST', path: `/channels/${id(channelId)}/typing` }),
      readStates: () =>
        request({
          method: 'GET',
          path: '/users/@me/read-states',
          data: z.object({
            readStates: z.array(readStateSchema),
            mentionCounts: mentionCountsSchema,
          }),
        }),
    },
    search: {
      /** Messages of a server, in the channels the user may read. */
      guild: (guildId: Snowflake, query: SearchMessagesQuery) =>
        request({
          method: 'GET',
          path: `/guilds/${id(guildId)}/messages/search${queryString(query)}`,
          data: searchResultSchema,
        }),
      /** Messages of one channel (a DM included). */
      channel: (channelId: Snowflake, query: SearchMessagesQuery) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/messages/search${queryString(query)}`,
          data: searchResultSchema,
        }),
    },
    pins: {
      list: (channelId: Snowflake) =>
        request({ method: 'GET', path: `/channels/${id(channelId)}/pins`, data: messagesResult }),
      pin: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'PUT', path: `/channels/${id(channelId)}/pins/${id(messageId)}` }),
      unpin: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'DELETE', path: `/channels/${id(channelId)}/pins/${id(messageId)}` }),
    },
    polls: {
      /** My answers, replacing earlier ones (none takes my vote back). */
      vote: (channelId: Snowflake, messageId: Snowflake, answerIds: readonly number[]) =>
        request({
          method: 'PUT',
          path: `/channels/${id(channelId)}/polls/${id(messageId)}/answers/@me`,
          body: { answerIds: [...answerIds] },
          data: pollResult,
        }),
      /** Who picked an answer, a page at a time (403 `POLL_ANONYMOUS` in an anonymous poll). */
      voters: (
        channelId: Snowflake,
        messageId: Snowflake,
        answerId: number,
        query: PollVotersQuery = {},
      ) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/polls/${id(messageId)}/answers/${answerId}/voters${queryString(query)}`,
          data: z.object({ users: z.array(publicUserSchema) }),
        }),
      /** Its author ends a poll early. */
      end: (channelId: Snowflake, messageId: Snowflake) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/polls/${id(messageId)}/expire`,
          data: pollResult,
        }),
    },
    reactions: {
      /** Encrypted conversations: my whole set, encrypted (null takes them all back). */
      setEncrypted: (channelId: Snowflake, messageId: Snowflake, ciphertext: string | null) =>
        request({
          method: ciphertext ? 'PUT' : 'DELETE',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}/e2ee-reactions/@me`,
          ...(ciphertext ? { body: { ciphertext } } : {}),
        }),
      add: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({ method: 'PUT', path: `${reactionPath(channelId, messageId, emoji)}/@me` }),
      remove: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({ method: 'DELETE', path: `${reactionPath(channelId, messageId, emoji)}/@me` }),
      /** Someone else's reaction (MANAGE_MESSAGES). */
      removeOf: (channelId: Snowflake, messageId: Snowflake, emoji: string, userId: Snowflake) =>
        request({
          method: 'DELETE',
          path: `${reactionPath(channelId, messageId, emoji)}/${id(userId)}`,
        }),
      users: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({
          method: 'GET',
          path: reactionPath(channelId, messageId, emoji),
          data: z.object({ users: z.array(publicUserSchema) }),
        }),
    },
    attachments: {
      create: createAttachment,
      /** Uploads a file for a message in the channel; resolves to the id for `attachmentIds`. */
      async upload(channelId: Snowflake, file: Blob, options?: UploadOptions): Promise<Snowflake> {
        const { attachment } = await createAttachment(channelId, describeFile(file, options))
        await putFile(attachment, file, options?.onProgress)
        return attachment.id
      },
    },
  }
}
