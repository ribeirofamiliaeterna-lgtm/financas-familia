import { Rule, Transaction } from './types'
import { normalizeDescription, similarity } from './normalize'

/**
 * Motor de categorização em duas camadas:
 * 1. REGRAS explícitas (contains/exact/regex) — determinísticas, criadas pelo usuário
 *    ao aceitar sugestões ("Master Imobiliária" → Aluguel).
 * 2. HISTÓRICO — similaridade com transações já confirmadas, gera sugestão com confiança.
 */

export function ruleMatches(rule: Rule, normalized: string): boolean {
  const pattern = normalizeDescription(rule.pattern)
  switch (rule.match_type) {
    case 'exact': return normalized === pattern
    case 'regex':
      try { return new RegExp(rule.pattern, 'i').test(normalized) } catch { return false }
    default: return normalized.includes(pattern)
  }
}

/** Encontra a regra vencedora (maior prioridade; empate = pattern mais longo) */
export function matchRule(rules: Rule[], normalized: string): Rule | null {
  let best: Rule | null = null
  for (const r of rules) {
    if (!ruleMatches(r, normalized)) continue
    if (!best || r.priority > best.priority ||
        (r.priority === best.priority && r.pattern.length > best.pattern.length)) {
      best = r
    }
  }
  return best
}

export interface HistorySuggestion {
  categoryId: string
  confidence: number // 0..1
}

/**
 * Sugere categoria pela semelhança com transações confirmadas anteriores.
 * Considera as N mais similares e vota na categoria mais frequente.
 */
export function suggestFromHistory(
  history: Pick<Transaction, 'normalized' | 'category_id'>[],
  normalized: string,
  minSimilarity = 0.5,
): HistorySuggestion | null {
  const scored = history
    .filter(t => t.category_id)
    .map(t => ({ cat: t.category_id!, sim: similarity(t.normalized, normalized) }))
    .filter(s => s.sim >= minSimilarity)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 8)
  if (scored.length === 0) return null

  const votes = new Map<string, { count: number; simSum: number }>()
  for (const s of scored) {
    const v = votes.get(s.cat) ?? { count: 0, simSum: 0 }
    v.count++; v.simSum += s.sim
    votes.set(s.cat, v)
  }
  let bestCat = '', bestScore = 0, bestSim = 0
  votes.forEach((v, cat) => {
    const score = v.count * (v.simSum / v.count)
    if (score > bestScore) { bestScore = score; bestCat = cat; bestSim = v.simSum / v.count }
  })
  const share = (votes.get(bestCat)!.count) / scored.length
  return { categoryId: bestCat, confidence: Math.min(1, bestSim * 0.6 + share * 0.4) }
}
