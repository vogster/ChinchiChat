import { detectImageType, isInlineImage } from '@chinchi/shared'
import { FileText, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from '../messages/format-size'
import { decryptFile } from './file-crypto'

import type { SealedFile } from './codec'

/** Images up to this size decrypt as soon as they show; anything else waits for a click. */
const AUTO_DECRYPT_MAX = 20 * 1024 * 1024

/** Downloads the ciphertext and opens it here; the server never sees the plain bytes. */
const open = async (file: Pick<SealedFile, 'url' | 'key' | 'iv'>): Promise<Uint8Array> => {
  const response = await fetch(file.url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return decryptFile(new Uint8Array(await response.arrayBuffer()), file)
}

const asBlobUrl = (bytes: Uint8Array, type: string) =>
  URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))

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
  const { t } = useTranslation()
  const [state, setState] = useState<{ url: string } | 'loading' | 'file' | 'failed'>('loading')

  // Primitive deps: the file object is rebuilt on every render of the message list.
  const { url: source, key, iv } = file
  useEffect(() => {
    let current = true
    let url: string | null = null
    open({ url: source, key, iv }).then(
      (bytes) => {
        const type = detectImageType(bytes)
        if (!current) return
        if (!type) return setState('file')
        url = asBlobUrl(bytes, type)
        setState({ url })
      },
      () => current && setState('failed'),
    )
    return () => {
      current = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [source, key, iv])

  if (state === 'failed') return <Failed name={file.name} />
  if (state === 'file') return <SealedDownload file={file} />
  if (state === 'loading') {
    return <p className="text-sm text-muted">{t('e2ee.fileDecrypting', { name: file.name })}</p>
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

/** Decrypts on click and hands the file over under its real name. */
const SealedDownload = ({ file }: { file: SealedFile }) => {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')

  const download = async () => {
    setState('loading')
    try {
      const url = asBlobUrl(await open(file), 'application/octet-stream')
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      // Give the browser a moment to start the download before letting go of the bytes.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${file.name} (${formatFileSize(file.size, i18n.language)})`}
        disabled={state === 'loading'}
        onClick={() => void download()}
        className="flex max-w-sm items-center gap-3 rounded-md border border-line bg-field px-3 py-2 text-left hover:bg-chip disabled:opacity-60"
      >
        <FileText aria-hidden className="size-8 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block truncate text-accent">{file.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Lock aria-hidden className="size-3" />
            {state === 'loading'
              ? t('e2ee.fileDecrypting', { name: file.name })
              : formatFileSize(file.size, i18n.language)}
          </span>
        </span>
      </button>
      {state === 'failed' ? <Failed name={file.name} /> : null}
    </>
  )
}

/** The files of an encrypted message, opened on this device. */
export const EncryptedAttachments = ({ files }: { files: readonly SealedFile[] }) => {
  if (files.length === 0) return null
  return (
    <ul className="mt-1 flex flex-col items-start gap-1.5">
      {files.map((file) => (
        <li key={file.id}>
          {isInlineImage(file.type) && file.size <= AUTO_DECRYPT_MAX ? (
            <SealedImage file={file} />
          ) : (
            <SealedDownload file={file} />
          )}
        </li>
      ))}
    </ul>
  )
}
