/**
 * Normalização de descrições de extrato para matching de regras.
 * "PIX ENVIADO 123456 Master Imobiliaria LTDA 05/07" -> "PIX ENVIADO MASTER IMOBILIARIA LTDA"
 */
export function normalizeDescription(desc: string): string {
  return desc
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toUpperCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ') // datas
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ') // números longos (ids, docs)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Hash simples e estável (FNV-1a) para dedupe de transações */
export function txHash(accountId: string | null, date: string, amount: number, normalized: string): string {
  const s = `${accountId ?? ''}|${date}|${amount.toFixed(2)}|${normalized}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + '-' + s.length.toString(36)
}

/** Tokens significativos de uma descrição normalizada (ignora palavras genéricas de banco) */
const STOPWORDS = new Set([
  'PIX', 'TED', 'DOC', 'TRANSFERENCIA', 'TRANSF', 'PAGAMENTO', 'PGTO', 'COMPRA',
  'CARTAO', 'DEBITO', 'CREDITO', 'ENVIADO', 'RECEBIDO', 'RECEBIDA', 'ENVIADA',
  'DE', 'DA', 'DO', 'PARA', 'LTDA', 'ME', 'SA', 'EIRELI', 'BR', 'COM',
])
export function tokens(normalized: string): string[] {
  return normalized.split(' ').filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

/** Similaridade Jaccard entre conjuntos de tokens (0..1) */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  ta.forEach(t => { if (tb.has(t)) inter++ })
  return inter / (ta.size + tb.size - inter)
}

/** Sugere um pattern de regra a partir da descrição (tokens mais distintivos) */
export function suggestPattern(normalized: string): string {
  const ts = tokens(normalized)
  return ts.slice(0, 3).join(' ') || normalized
}
