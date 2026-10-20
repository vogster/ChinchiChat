import { useMemo } from 'react'
import { encode, QrCodeDataType } from 'uqr'

/** Dark enough on white for any camera, in the hue of the chosen palette. */
const EYE = { fill: 'oklch(0.45 0.15 var(--zl-ah))' }
const DOT = '#16161d'
/** Share of the side under the logo; error correction H restores up to 30% of the code. */
const LOGO_SHARE = 0.22

/** The three corner squares a camera locks on to: a rounded ring with a rounded centre. */
const eye = (x: number, y: number) =>
  `M${x + 2} ${y}h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z` +
  `M${x + 2.4} ${y + 1}a1.4 1.4 0 0 0-1.4 1.4v2.2a1.4 1.4 0 0 0 1.4 1.4h2.2a1.4 1.4 0 0 0 1.4-1.4v-2.2a1.4 1.4 0 0 0-1.4-1.4z` +
  `M${x + 3} ${y + 2}h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z`

/** One module as a dot (a circle drawn with two arcs). */
const dot = (x: number, y: number) =>
  `M${x + 0.08} ${y + 0.5}a0.42 0.42 0 1 0 0.84 0a0.42 0.42 0 1 0-0.84 0`

/**
 * A QR code drawn as SVG: round dots, rounded corner squares and the app mark in the middle.
 * Always on white, whatever the theme: that is what phone cameras read reliably.
 */
export const QrCode = ({ value, label }: { value: string; label: string }) => {
  const { size, dots, eyes, logo } = useMemo(() => {
    const qr = encode(value, { ecc: 'H', border: 2 })
    const span = Math.round((qr.size * LOGO_SHARE) / 2) * 2 + 1
    const from = (qr.size - span) / 2
    const underLogo = (x: number, y: number) =>
      x >= from && x < from + span && y >= from && y < from + span
    const path = qr.data
      .flatMap((row, y) =>
        row.map((dark, x) =>
          dark && qr.types[y]?.[x] !== QrCodeDataType.Position && !underLogo(x, y) ? dot(x, y) : '',
        ),
      )
      .join('')
    const far = qr.size - 2 - 7
    return {
      size: qr.size,
      dots: path,
      eyes: eye(2, 2) + eye(far, 2) + eye(2, far),
      logo: { from, span },
    }
  }, [value])

  const mark = logo.span * 0.62
  const markAt = logo.from + (logo.span - mark) / 2
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className="size-48 rounded-card"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={dots} fill={DOT} />
      <path d={eyes} fillRule="evenodd" style={EYE} />
      <rect
        x={logo.from + 0.3}
        y={logo.from + 0.3}
        width={logo.span - 0.6}
        height={logo.span - 0.6}
        rx={logo.span * 0.28}
        style={EYE}
      />
      {/* The app mark (as in the favicon), scaled into the plate. */}
      <path
        transform={`translate(${markAt} ${markAt}) scale(${mark / 64})`}
        d="M48 18a18 18 0 1 0 0 28"
        fill="none"
        stroke="#ffffff"
        strokeWidth={9}
        strokeLinecap="round"
      />
    </svg>
  )
}
