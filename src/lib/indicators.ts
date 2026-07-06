import { Account, Category, Debt, Transaction } from './types'
import { toMonthKey } from './format'

/**
 * Indicadores de saúde financeira (padrões de mercado):
 * taxa de poupança, comprometimento de renda com dívidas (DTI),
 * custo fixo/renda, reserva de emergência em meses, etc.
 */

export interface MonthStats {
  month: string
  income: number
  expense: number // positivo (valor absoluto das despesas)
  net: number
}

export function monthlySeries(txs: Transaction[], months: string[]): MonthStats[] {
  const map = new Map<string, MonthStats>()
  for (const m of months) map.set(m, { month: m, income: 0, expense: 0, net: 0 })
  for (const t of txs) {
    const key = toMonthKey(t.date)
    const s = map.get(key)
    if (!s) continue
    if (t.amount > 0) s.income += t.amount
    else s.expense += -t.amount
    s.net = s.income - s.expense
  }
  return months.map(m => map.get(m)!)
}

export interface CategoryTotal {
  categoryId: string
  name: string
  grp: string
  total: number // positivo
  fixed: boolean
}

export function expenseByCategory(txs: Transaction[], cats: Category[], month?: string): CategoryTotal[] {
  const catMap = new Map(cats.map(c => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (t.amount >= 0) continue
    if (month && toMonthKey(t.date) !== month) continue
    const key = t.category_id ?? 'sem'
    totals.set(key, (totals.get(key) ?? 0) + -t.amount)
  }
  const out: CategoryTotal[] = []
  totals.forEach((total, id) => {
    const c = catMap.get(id)
    out.push({
      categoryId: id,
      name: c?.name ?? 'Sem categoria',
      grp: c?.grp ?? 'Sem categoria',
      total,
      fixed: c?.fixed ?? false,
    })
  })
  return out.sort((a, b) => b.total - a.total)
}

export function groupTotals(byCat: CategoryTotal[]): { grp: string; total: number }[] {
  const map = new Map<string, number>()
  for (const c of byCat) map.set(c.grp, (map.get(c.grp) ?? 0) + c.total)
  return [...map.entries()].map(([grp, total]) => ({ grp, total })).sort((a, b) => b.total - a.total)
}

export interface HealthIndicators {
  savingsRate: number | null      // (receita - despesa) / receita
  dti: number | null              // pagamentos de dívida / receita
  fixedCostRatio: number | null   // custos fixos / receita
  emergencyMonths: number | null  // reserva / despesa essencial média
  subscriptionsMonthly: number    // total mensal do grupo Assinaturas
  avgDailySpend: number
  projectedMonthEnd: number       // projeção de despesa até o fim do mês
}

export function computeIndicators(opts: {
  monthTxs: Transaction[]         // transações do mês corrente
  cats: Category[]
  debts: Debt[]
  accounts: Account[]
  avgMonthlyExpense: number       // média de despesas dos últimos meses
  today?: Date
}): HealthIndicators {
  const { monthTxs, cats, debts, accounts, avgMonthlyExpense } = opts
  const today = opts.today ?? new Date()

  const income = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + -t.amount, 0)

  const byCat = expenseByCategory(monthTxs, cats)
  const fixed = byCat.filter(c => c.fixed).reduce((s, c) => s + c.total, 0)
  const subs = byCat.filter(c => c.grp === 'Assinaturas').reduce((s, c) => s + c.total, 0)

  const debtPayments = debts.reduce((s, d) => s + d.min_payment, 0)
  const reserve = accounts.filter(a => a.type === 'reserva' || a.type === 'poupanca')
    .reduce((s, a) => s + a.balance, 0)

  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const avgDaily = dayOfMonth > 0 ? expense / dayOfMonth : 0

  return {
    savingsRate: income > 0 ? (income - expense) / income : null,
    dti: income > 0 ? debtPayments / income : null,
    fixedCostRatio: income > 0 ? fixed / income : null,
    emergencyMonths: avgMonthlyExpense > 0 ? reserve / avgMonthlyExpense : null,
    subscriptionsMonthly: subs,
    avgDailySpend: avgDaily,
    projectedMonthEnd: avgDaily * daysInMonth,
  }
}

/** Detecta lançamentos recorrentes (mesma descrição em 2+ meses, valor estável) */
export interface Recurring {
  normalized: string
  description: string
  months: number
  avgAmount: number
  categoryId: string | null
}

export function detectRecurring(txs: Transaction[]): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.amount >= 0) continue
    const list = groups.get(t.normalized) ?? []
    list.push(t)
    groups.set(t.normalized, list)
  }
  const out: Recurring[] = []
  groups.forEach((list, normalized) => {
    const months = new Set(list.map(t => toMonthKey(t.date)))
    if (months.size < 2) return
    const avg = list.reduce((s, t) => s + -t.amount, 0) / list.length
    out.push({
      normalized,
      description: list[0].description,
      months: months.size,
      avgAmount: avg,
      categoryId: list[0].category_id,
    })
  })
  return out.sort((a, b) => b.avgAmount * b.months - a.avgAmount * a.months)
}

/** Top estabelecimentos por gasto no período */
export function topMerchants(txs: Transaction[], n = 8): { name: string; total: number; count: number }[] {
  const map = new Map<string, { name: string; total: number; count: number }>()
  for (const t of txs) {
    if (t.amount >= 0) continue
    const cur = map.get(t.normalized) ?? { name: t.description, total: 0, count: 0 }
    cur.total += -t.amount; cur.count++
    map.set(t.normalized, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n)
}
