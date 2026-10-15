import { useMemo } from 'react'
import { encode } from 'uqr'

/**
 * A QR code drawn as SVG. Always black on white, whatever the theme: that is what
 * phone cameras read reliably.
 */
export const QrCode = ({ value, label }: { value: string; label: string }) => {
  const { data, size } = useMemo(() => encode(value, { ecc: 'M', border: 2 }), [value])
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 rounded-md"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
