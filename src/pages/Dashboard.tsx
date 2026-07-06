import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ensureDefaultCategories, fetchAccounts, fetchBudgets, fetchDebts, fetchTransactions } from '../lib/data'
import { computeIndicators, expenseByCategory, groupTotals, monthlySeries } from '../lib/indicators'
import { Account, Budget, Category, Debt, Transaction } from '../lib/types'
import { brl, currentMonthKey, lastNMonthKeys, monthLabelLong, pct } from '../lib/format'
import { HBarList, MonthlyBars, StatTile } from '../components/charts'

export default function Dashboard() {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const month = currentMonthKey()
  const months12 = lastNMonthKeys(12)

  useEffect(() => {
    Promise.all([
      fetchTransactions(months12[0]),
      ensureDefaultCategories(),
      fetchDebts(),
      fetchAccounts(),
      fetchBudgets(month),
    ]).then(([t, c, d, a, b]) => {
      setTxs(t); setCats(c); setDebts(d); setAccounts(a); setBudgets(b)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const monthTxs = useMemo(() => txs.filter(t => t.date >= month), [txs, month])
  const series = useMemo(() => monthlySeries(txs, months12), [txs])

  const avgExpense = useMemo(() => {
    const past = series.slice(0, -1).filter(s => s.expense > 0)
    if (past.length === 0) return series.at(-1)?.expense ?? 0
    return past.reduce((s, m) => s + m.expense, 0) / past.length
  }, [series])

  const ind = useMemo(() => computeIndicators({
    monthTxs, cats, debts, accounts, avgMonthlyExpense: avgExpense,
  }), [monthTxs, cats, debts, accounts, avgExpense])

  const byCat = useMemo(() => expenseByCategory(monthTxs, cats, month), [monthTxs, cats])
  const byGroup = useMemo(() => groupTotals(byCat), [byCat])

  const income = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + -t.amount, 0)
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0)

  const overBudget = useMemo(() => {
    const budgetByCat = new Map(budgets.map(b => [b.category_id, b.amount]))
    return byCat
      .filter(c => {
        const b = budgetByCat.get(c.categoryId)
        return b !== undefined && b > 0 && c.total > b
      })
      .map(c => ({ ...c, budget: budgetByCat.get(c.categoryId)! }))
  }, [byCat, budgets])

  if (loading) return <p className="muted">Carregando…</p>
  if (error) return <div className="alert critical">{error}</div>

  if (txs.length === 0) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div className="card">
          <h2>Bem-vindo! Comece por aqui:</h2>
          <ol style={{ lineHeight: 2 }}>
            <li>Crie suas contas em <Link to="/config">Configurações</Link> (ex.: Santander, Nubank, Mercado Pago)</li>
            <li>Importe seu primeiro extrato em <Link to="/conciliacao">Conciliação</Link></li>
            <li>Cadastre suas dívidas em <Link to="/dividas">Dívidas</Link> para montar o plano de quitação</li>
            <li>Defina o orçado de cada categoria em <Link to="/orcamento">Orçamento</Link> (seu forecast)</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="subtitle">{monthLabelLong(month)}</p>

      {overBudget.length > 0 && (
        <div className="alert critical">
          <b>Estouro de orçamento:</b> {overBudget.slice(0, 4).map(c => `${c.name} (${brl(c.total)} de ${brl(c.budget)})`).join(', ')}
        </div>
      )}
      {ind.savingsRate !== null && ind.savingsRate < 0 && (
        <div className="alert critical"><b>Mês no vermelho:</b> as despesas superam as receitas em {brl(expense - income)}.</div>
      )}

      <div className="grid tiles">
        <StatTile label="Receitas do mês" value={brl(income)} />
        <StatTile label="Despesas do mês" value={brl(expense)} />
        <StatTile label="Saldo do mês" value={brl(income - expense)} tone={income - expense >= 0 ? 'good' : 'bad'} />
        <StatTile label="Taxa de poupança" value={ind.savingsRate === null ? '—' : pct(ind.savingsRate)}
          hint="meta: 10–20% da renda" tone={ind.savingsRate !== null && ind.savingsRate >= 0.1 ? 'good' : ind.savingsRate !== null && ind.savingsRate < 0 ? 'bad' : 'neutral'} />
      </div>
      <div className="grid tiles">
        <StatTile label="Dívida total" value={brl(totalDebt)} tone={totalDebt > 0 ? 'bad' : 'good'} />
        <StatTile label="Renda comprometida c/ dívidas" value={ind.dti === null ? '—' : pct(ind.dti)}
          hint="saudável: abaixo de 36%" tone={ind.dti !== null && ind.dti > 0.36 ? 'bad' : 'neutral'} />
        <StatTile label="Custo fixo / renda" value={ind.fixedCostRatio === null ? '—' : pct(ind.fixedCostRatio)}
          hint="ideal: até 50–60%" tone={ind.fixedCostRatio !== null && ind.fixedCostRatio > 0.6 ? 'bad' : 'neutral'} />
        <StatTile label="Reserva de emergência" value={ind.emergencyMonths === null ? '—' : `${ind.emergencyMonths.toFixed(1)} meses`}
          hint="meta: 3–6 meses de despesas" tone={ind.emergencyMonths !== null && ind.emergencyMonths >= 3 ? 'good' : 'neutral'} />
      </div>
      <div className="grid tiles">
        <StatTile label="Gasto médio por dia" value={brl(ind.avgDailySpend)} hint={`projeção do mês: ${brl(ind.projectedMonthEnd)}`} />
        <StatTile label="Assinaturas / mês" value={brl(ind.subscriptionsMonthly)} hint={`${brl(ind.subscriptionsMonthly * 12)} por ano`} />
      </div>

      <div className="card">
        <h2>Receitas × Despesas — últimos 12 meses</h2>
        <MonthlyBars data={series} />
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Gastos do mês por grupo</h2>
          <HBarList items={byGroup.map(g => ({ name: g.grp, total: g.total }))} />
        </div>
        <div className="card">
          <h2>Maiores categorias do mês</h2>
          <HBarList items={byCat.map(c => ({ name: c.name, total: c.total }))} />
        </div>
      </div>
    </div>
  )
}
