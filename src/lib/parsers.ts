import { ParsedRow } from './types'

/**
 * Parsers de extrato bancário: OFX (padrão dos bancos brasileiros) e CSV
 * (com detecção automática de separador, formato de data e vírgula decimal).
 */

export function parseStatement(filename: string, content: string): ParsedRow[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.ofx') || /<OFX>|<STMTTRN>/i.test(content)) return parseOFX(content)
  return parseCSV(content)
}

// ---------- OFX ----------
export function parseOFX(content: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const blocks = content.split(/<STMTTRN>/i).slice(1)
  for (const block of blocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`, 'i'))
      return m ? m[1].trim() : ''
    }
    const rawDate = get('DTPOSTED')
    const rawAmt = get('TRNAMT')
    const memo = get('MEMO') || get('NAME') || 'Sem descrição'
    if (!rawDate || !rawAmt) continue
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    const amount = parseFloat(rawAmt.replace(',', '.'))
    if (isNaN(amount) || amount === 0) continue
    rows.push({ date, description: memo, amount })
  }
  return rows
}

// ---------- CSV ----------
export function parseCSV(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const sep = detectSeparator(lines)
  const table = lines.map(l => splitCSVLine(l, sep))

  // detecta colunas pela 1ª linha de dados (pula cabeçalho se houver)
  const startIdx = looksLikeHeader(table[0]) ? 1 : 0
  const sample = table[startIdx]
  if (!sample) return []
  const dateCol = sample.findIndex(c => parseDate(c) !== null)
  if (dateCol === -1) return []

  const rows: ParsedRow[] = []
  for (let i = startIdx; i < table.length; i++) {
    const cols = table[i]
    const date = parseDate(cols[dateCol] ?? '')
    if (!date) continue
    // valor: última coluna numérica que não seja a data
    let amount: number | null = null
    for (let c = cols.length - 1; c >= 0; c--) {
      if (c === dateCol) continue
      const v = parseAmountBR(cols[c])
      if (v !== null && v !== 0) { amount = v; break }
    }
    if (amount === null) continue
    // descrição: coluna de texto mais longa que não é data nem número
    let description = ''
    for (const [c, col] of cols.entries()) {
      if (c === dateCol) continue
      if (parseAmountBR(col) !== null) continue
      if (col.length > description.length) description = col
    }
    rows.push({ date, description: description || 'Sem descrição', amount })
  }
  return rows
}

function detectSeparator(lines: string[]): string {
  const counts = { ';': 0, ',': 0, '\t': 0 }
  for (const l of lines.slice(0, 10)) {
    counts[';'] += (l.match(/;/g) || []).length
    counts['\t'] += (l.match(/\t/g) || []).length
    counts[','] += (l.match(/,/g) || []).length
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';'
  if (counts['\t'] > counts[',']) return '\t'
  return ','
}

function splitCSVLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === sep && !inQuotes) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function looksLikeHeader(cols: string[]): boolean {
  return cols.every(c => parseDate(c) === null) &&
    cols.some(c => /data|date|descri|hist|valor|amount|lan[cç]/i.test(c))
}

/** aceita dd/mm/yyyy, dd/mm/yy, yyyy-mm-dd, dd-mm-yyyy */
export function parseDate(s: string): string | null {
  s = s.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    const [, d, mo, y] = m
    const year = y.length === 2 ? `20${y}` : y
    const day = d.padStart(2, '0'), mon = mo.padStart(2, '0')
    if (+mon < 1 || +mon > 12 || +day < 1 || +day > 31) return null
    return `${year}-${mon}-${day}`
  }
  return null
}

/** aceita "1.234,56", "-1234.56", "R$ 1.234,56", "1234,56 D" (D=débito) */
export function parseAmountBR(s: string): number | null {
  if (!s) return null
  let str = s.trim()
  const isDebit = /\bD\b$/i.test(str) && !/\bC\b$/i.test(str)
  str = str.replace(/R\$\s?/i, '').replace(/\s*[DC]\s*$/i, '').trim()
  if (!/^[-+]?[\d.,]+$/.test(str)) return null
  const hasComma = str.includes(',')
  const hasDot = str.includes('.')
  let normalized: string
  if (hasComma && hasDot) {
    // o último símbolo é o decimal
    normalized = str.lastIndexOf(',') > str.lastIndexOf('.')
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '')
  } else if (hasComma) {
    normalized = str.replace(/\./g, '').replace(',', '.')
  } else {
    // só ponto: se parecer separador de milhar (ex. 1.234), trata como milhar
    normalized = /^\d{1,3}(\.\d{3})+$/.test(str) ? str.replace(/\./g, '') : str
  }
  const v = parseFloat(normalized)
  if (isNaN(v)) return null
  return isDebit ? -Math.abs(v) : v
}
