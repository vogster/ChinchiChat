import { detectAudioType, detectImageType, isInlineAudio, isInlineImage } from '@chinchi/shared'
import { FileText, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { useCancellableDownload } from '../media/use-cancellable-download'
import { useDownloadProgress } from '../media/use-download-progress'
import { formatFileSize } from '../messages/format-size'
import { useSaveFile } from '../shell/use-save-file'
import { VoicePlayer } from '../voice-messages/voice-player'
import { decryptFile, sealedSize } from './file-crypto'
import { SealedProgress } from './sealed-progress'

import type { SealedFile } from './codec'
import type { Download, DownloadOptions } from '@chinchi/sdk'

/** Images up to this size decrypt as soon as they show; anything else waits for a click. */
const AUTO_DECRYPT_MAX = 20 * 1024 * 1024

/** Downloads the ciphertext and opens it here; the server never sees the plain bytes. */
const open = async (
  download: Download,
  file: Pick<SealedFile, 'url' | 'key' | 'iv'>,
  options?: DownloadOptions,
): Promise<Uint8Array> => {
  const blob = await download(file.url, options)
  const bytes = await decryptFile(new Uint8Array(await blob.arrayBuffer()), file)
  options?.signal?.throwIfAborted()
  return bytes
}

const asBlobUrl = (bytes: Uint8Array, type: string) =>
  URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))

/** A voice message decrypted here; played only if the bytes really are audio. */
const openVoice = async (download: Download, file: SealedFile): Promise<Blob> => {
  const bytes = await open(download, file)
  const type = detectAudioType(bytes)
  if (!type) throw new Error('Not audio')
  return new Blob([new Uint8Array(bytes)], { type })
}

const Failed = ({ name }: { name: string }) => {
  const { t } = useTranslation()
  return (
    <p role="alert" className="text-sm text-danger">
      {t('e2ee.fileFailed', { name })}
    </p>
  )
}

/** Shown inline only if the decrypted bytes really are an image the browser may render. */
const SealedImage = ({ file }: { file: SealedFile }) => {
  const { download } = useApi().media
  const [state, setState] = useState<{ url: string } | 'loading' | 'file' | 'stopped' | 'failed'>(
    'loading',
  )
  const { progress, onProgress } = useDownloadProgress(sealedSize(file.size))
  const abort = useRef<AbortController | null>(null)

  // Primitive deps: the file object is rebuilt on every render of the message list.
  const { url: source, key, iv } = file
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    let url: string | null = null
    open(download, { url: source, key, iv }, { signal: controller.signal, onProgress }).then(
      (bytes) => {
        const type = detectImageType(bytes)
        if (controller.signal.aborted) return
        if (!type) return setState('file')
        url = asBlobUrl(bytes, type)
        setState({ url })
      },
      () => controller.signal.aborted || setState('failed'),
    )
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [download, source, key, iv, onProgress])

  // Stopped, it waits for a click like any other file.
  const cancel = () => {
    abort.current?.abort()
    setState('stopped')
  }

  if (state === 'failed') return <Failed name={file.name} />
  if (state === 'file') return <SealedDownload file={file} />
  if (state === 'stopped') return <SealedDownload file={file} autoFocus />
  if (state === 'loading') {
    return <SealedProgress name={file.name} progress={progress} onCancel={cancel} />
  }
  return (
    <a href={state.url} download={file.name} className="block overflow-hidden rounded-md bg-field">
      <img
        data-native-menu
        src={state.url}
        alt={file.name}
        className="max-h-[300px] max-w-[min(400px,100%)] object-contain"
      />
    </a>
  )
}

/**
 * Decrypts on click and hands the file over under its real name; can be stopped midway.
 * `autoFocus`: it replaces something that had the focus.
 */
const SealedDownload = ({ file, autoFocus = false }: { file: SealedFile; autoFocus?: boolean }) => {
  const { i18n } = useTranslation()
  const api = useApi()
  const save = useSaveFile()
  const { state, progress, width, start, cancel, trigger, progressBox } =
    useCancellableDownload<HTMLButtonElement>({
      expectedBytes: sealedSize(file.size),
      load: async (options) =>
        new Blob([new Uint8Array(await open(api.media.download, file, options))], {
          type: 'application/octet-stream',
        }),
      save: (blob) => save(file.name, blob),
      autoFocus,
    })

  if (state === 'loading') {
    return (
      <SealedProgress
        ref={progressBox}
        name={file.name}
        progress={progress}
        onCancel={cancel}
        focusCancel
        width={width}
      />
    )
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`${file.name} (${formatFileSize(file.size, i18n.language)})`}
        onClick={() => void start()}
        className="flex max-w-sm items-center gap-3 rounded-md border border-line bg-field px-3 py-2 text-left hover:bg-chip"
      >
        <FileText aria-hidden className="size-8 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block truncate text-accent">{file.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Lock aria-hidden className="size-3" />
            {formatFileSize(file.size, i18n.language)}
          </span>
        </span>
      </button>
      {state === 'failed' ? <Failed name={file.name} /> : null}
    </>
  )
}

/** The files of an encrypted message, opened on this device. */
export const EncryptedAttachments = ({ files }: { files: readonly SealedFile[] }) => {
  const api = useApi()
  if (files.length === 0) return null
  return (
    <ul className="mt-1 flex flex-col items-start gap-1.5">
      {files.map((file) => (
        <li key={file.id}>
          {isInlineAudio(file.type) && file.size <= AUTO_DECRYPT_MAX ? (
            <VoicePlayer name={file.name} load={() => openVoice(api.media.download, file)} />
          ) : isInlineImage(file.type) && file.size <= AUTO_DECRYPT_MAX ? (
            <SealedImage file={file} />
          ) : (
            <SealedDownload file={file} />
          )}
        </li>
      ))}
    </ul>
  )
}
