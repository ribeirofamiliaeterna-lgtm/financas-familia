import { supabase } from './supabase'
import { Commitment } from './types'
import { addMonths } from './format'

/**
 * COMPROMISSOS: parcelamentos de cartão ("10x de R$320 a partir de março")
 * e despesas recorrentes ("Streaming R$40/mês, sem data de fim"), cadastrados
 * uma vez e projetados automaticamente mês a mês no Orçamento e no Dashboard.
 */

export async function fetchCommitments(): Promise<Commitment[]> {
  const { data, error } = await supabase().from('commitments').select('*').order('start_month')
  if (error) throw error
  return data as Commitment[]
}

export type CommitmentInput = {
  name: string
  type: Commitment['type']
  category_id: string | null
  monthly_amount: number
  start_month: string
  installments_count: number | null
  late: boolean
  active: boolean
  notes?: string | null
}

function withEndMonth(input: CommitmentInput) {
  const end_month =
    input.type === 'parcelamento' && input.installments_count
      ? addMonths(input.start_month, input.installments_count - 1)
      : null
  return { ...input, end_month }
}

export async function createCommitment(input: CommitmentInput) {
  const { error } = await supabase().from('commitments').insert(withEndMonth(input))
  if (error) throw error
}

export async function updateCommitment(id: string, input: CommitmentInput) {
  const { error } = await supabase().from('commitments').update(withEndMonth(input)).eq('id', id)
  if (error) throw error
}

export async function deleteCommitment(id: string) {
  const { error } = await supabase().from('commitments').delete().eq('id', id)
  if (error) throw error
}

/** Valor do compromisso em um mês específico (0 se fora do período ou inativo) */
export function amountInMonth(c: Commitment, monthKey: string): number {
  if (!c.active) return 0
  if (monthKey < c.start_month) return 0
  if (c.end_month && monthKey > c.end_month) return 0
  return c.monthly_amount
}

/** Compromissos ativos em um mês específico */
export function commitmentsInMonth(commitments: Commitment[], monthKey: string): Commitment[] {
  return commitments.filter(c => amountInMonth(c, monthKey) > 0)
}

/** Soma por tipo em um mês (parcelamento × recorrente) */
export function totalsByType(commitments: Commitment[], monthKey: string) {
  let parcelamento = 0, recorrente = 0
  let parcelamentoCount = 0, recorrenteCount = 0
  for (const c of commitments) {
    const v = amountInMonth(c, monthKey)
    if (v <= 0) continue
    if (c.type === 'parcelamento') { parcelamento += v; parcelamentoCount++ }
    else { recorrente += v; recorrenteCount++ }
  }
  return { parcelamento, recorrente, parcelamentoCount, recorrenteCount }
}

/** Soma de compromissos por categoria em um mês (usado como sugestão de orçado) */
export function totalsByCategory(commitments: Commitment[], monthKey: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of commitments) {
    if (!c.category_id) continue
    const v = amountInMonth(c, monthKey)
    if (v <= 0) continue
    map.set(c.category_id, (map.get(c.category_id) ?? 0) + v)
  }
  return map
}

/** Série mensal parcelamento × recorrente para o gráfico de projeção */
export function projectByMonth(commitments: Commitment[], monthKeys: string[]) {
  return monthKeys.map(month => {
    const t = totalsByType(commitments, month)
    return { month, parcelamento: t.parcelamento, recorrente: t.recorrente }
  })
}
