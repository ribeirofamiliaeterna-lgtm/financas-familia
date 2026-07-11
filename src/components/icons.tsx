/** Ícones de linha minimalistas (16px, stroke, currentColor) — substituem emojis na UI. */

const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function TrashIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7.5v4M9.5 7.5v4" />
      <path d="M4 4.5l.6 8a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8" />
    </svg>
  )
}

export function EditIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M10.5 2.5l3 3L5 14H2v-3l8.5-8.5Z" />
      <path d="M9 4l3 3" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  )
}

/** Marca do app — substitui o emoji 💰 */
export function WalletMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }}>
      <rect x="1.5" y="3.5" width="13" height="9.5" rx="2" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M1.5 6.5h13" stroke="var(--accent)" strokeWidth="1.4" />
      <circle cx="11" cy="9.5" r="1.1" fill="var(--accent)" />
    </svg>
  )
}
