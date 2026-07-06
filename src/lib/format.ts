export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const brlShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return `${v < 0 ? '-' : ''}R$ ${(abs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return brl(v)
}

export const pct = (v: number, digits = 0) =>
  `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** '2026-07-01' -> 'jul/26' */
export const monthLabel = (monthKey: string) => {
  const [y, m] = monthKey.split('-')
  return `${MESES[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

export const monthLabelLong = (monthKey: string) => {
  const [y, m] = monthKey.split('-')
  const longos = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${longos[parseInt(m, 10) - 1]} de ${y}`
}

/** Date -> 'yyyy-mm-01' */
export const toMonthKey = (d: string | Date) => {
  const s = typeof d === 'string' ? d : d.toISOString().slice(0, 10)
  return `${s.slice(0, 7)}-01`
}

export const currentMonthKey = () => toMonthKey(new Date())

export const addMonths = (monthKey: string, n: number) => {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

export const lastNMonthKeys = (n: number, from = currentMonthKey()) => {
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) keys.push(addMonths(from, -i))
  return keys
}

export const dateBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
