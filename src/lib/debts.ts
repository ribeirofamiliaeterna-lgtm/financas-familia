import { Debt } from './types'

/**
 * Simulador de quitação de dívidas — estratégias clássicas:
 * - AVALANCHE: paga primeiro a de maior juros (matematicamente ótima)
 * - SNOWBALL: paga primeiro a de menor saldo (vitórias rápidas, motivação)
 * Em ambas, paga-se o mínimo de todas e o extra vai para a dívida-alvo.
 */

export type Strategy = 'avalanche' | 'snowball'

export interface PayoffMonth {
  monthIndex: number
  totalBalance: number
  interestPaid: number
  paid: number
}

export interface PayoffResult {
  months: number            // meses até quitar tudo
  totalInterest: number
  totalPaid: number
  schedule: PayoffMonth[]
  payoffOrder: { name: string; month: number }[]
  feasible: boolean         // false se o orçamento não cobre os juros
}

export function simulatePayoff(debts: Debt[], extraPerMonth: number, strategy: Strategy, maxMonths = 240): PayoffResult {
  const state = debts
    .filter(d => d.balance > 0)
    .map(d => ({ ...d, bal: d.balance }))

  const schedule: PayoffMonth[] = []
  const payoffOrder: { name: string; month: number }[] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  const target = () => {
    const open = state.filter(d => d.bal > 0)
    if (open.length === 0) return null
    return strategy === 'avalanche'
      ? open.reduce((a, b) => (b.monthly_rate > a.monthly_rate ? b : a))
      : open.reduce((a, b) => (b.bal < a.bal ? b : a))
  }

  while (state.some(d => d.bal > 0) && month < maxMonths) {
    month++
    let monthInterest = 0
    let monthPaid = 0

    // juros do mês
    for (const d of state) {
      if (d.bal <= 0) continue
      const j = d.bal * (d.monthly_rate / 100)
      d.bal += j
      monthInterest += j
    }

    // pagamento mínimo de todas
    let extra = extraPerMonth
    for (const d of state) {
      if (d.bal <= 0) continue
      const pay = Math.min(d.min_payment, d.bal)
      d.bal -= pay
      monthPaid += pay
      if (d.bal <= 0.005) {
        d.bal = 0
        payoffOrder.push({ name: d.name, month })
      }
    }

    // extra na dívida-alvo (cascata quando quita)
    while (extra > 0.005) {
      const t = target()
      if (!t) break
      const pay = Math.min(extra, t.bal)
      t.bal -= pay
      extra -= pay
      monthPaid += pay
      if (t.bal <= 0.005) {
        t.bal = 0
        payoffOrder.push({ name: t.name, month })
      }
    }

    totalInterest += monthInterest
    totalPaid += monthPaid
    schedule.push({
      monthIndex: month,
      totalBalance: state.reduce((s, d) => s + d.bal, 0),
      interestPaid: monthInterest,
      paid: monthPaid,
    })

    // orçamento não cobre nem os juros → dívida cresce, aborta
    if (schedule.length >= 3) {
      const [a, b, c] = schedule.slice(-3)
      if (c.totalBalance > b.totalBalance && b.totalBalance > a.totalBalance) {
        return { months: month, totalInterest, totalPaid, schedule, payoffOrder, feasible: false }
      }
    }
  }

  return {
    months: month,
    totalInterest,
    totalPaid,
    schedule,
    payoffOrder,
    feasible: !state.some(d => d.bal > 0),
  }
}
