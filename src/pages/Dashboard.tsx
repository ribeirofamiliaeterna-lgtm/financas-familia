import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ensureDefaultCategories, fetchAccounts, fetchBudgets, fetchDebts, fetchTransactions } from '../lib/data'
import { fetchCommitments, projectByMonth, totalsByType } from '../lib/commitments'
import { computeIndicators, expenseByCategory, groupTotals, healthScore, monthlySeries } from '../lib/indicators'
import { Account, Budget, Category, Commitment, Debt, Transaction } from '../lib/types'
import { brl, currentMonthKey, lastNMonthKeys, monthLabelLong, nextNMonthKeys, pct } from '../lib/format'
import { CompositionBar, HBarList, Meter, MonthlyBars, StackedMonthlyBars, StatTile, TrendLine } from '../components/charts'

export default function Dashboard() {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commitmentFilter, setCommitmentFilter] = useState<'todos' | 'parcelamento' | 'recorrente'>('todos')

  const month = currentMonthKey()
  const months12 = lastNMonthKeys(12)

  useEffect(() => {
    Promise.all([
      fetchTransactions(months12[0]),
      ensureDefaultCategories(),
      fetchDebts(),
      fetchAccounts(),
      fetchBudgets(month),
      fetchCommitments(),
    ]).then(([t, c, d, a, b, cm]) => {
      setTxs(t); setCats(c); setDebts(d); setAccounts(a); setBudgets(b); setCommitments(cm)
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
  const reserve = accounts.filter(a => a.type === 'reserva' || a.type === 'poupanca').reduce((s, a) => s + a.balance, 0)
  const netWorth = reserve - totalDebt
  const score = useMemo(() => healthScore(ind), [ind])

  /** Aproximação: parte do saldo atual (âncora) e desfaz o fluxo de caixa de cada mês pra trás. */
  const netWorthSeries = useMemo(() => {
    const out = new Array(series.length)
    let acc = netWorth
    out[series.length - 1] = { month: series[series.length - 1].month, value: acc }
    for (let i = series.length - 1; i >= 1; i--) {
      acc -= series[i].net
      out[i - 1] = { month: series[i - 1].month, value: acc }
    }
    return out
  }, [series, netWorth])

  const fixedVsVariable = useMemo(() => {
    const fixed = byCat.filter(c => c.fixed).reduce((s, c) => s + c.total, 0)
    const variable = byCat.filter(c => !c.fixed).reduce((s, c) => s + c.total, 0)
    return { fixed, variable }
  }, [byCat])

  const dueSoonDebts = useMemo(() => {
    const dom = new Date().getDate()
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    return debts.filter(d => {
      if (!d.due_day) return false
      const daysUntil = (d.due_day - dom + daysInMonth) % daysInMonth
      return daysUntil <= 5
    })
  }, [debts])

  const endingCommitments = useMemo(() => commitments.filter(c => c.active && c.end_month === month), [commitments, month])
  const lateCommitments = useMemo(() => commitments.filter(c => c.active && c.late && month >= c.start_month && (!c.end_month || month <= c.end_month)), [commitments, month])

  const overBudget = useMemo(() => {
    const budgetByCat = new Map(budgets.map(b => [b.category_id, b.amount]))
    return byCat
      .filter(c => {
        const b = budgetByCat.get(c.categoryId)
        return b !== undefined && b > 0 && c.total > b
      })
      .map(c => ({ ...c, budget: budgetByCat.get(c.categoryId)! }))
  }, [byCat, budgets])

  const commitmentTotals = useMemo(() => totalsByType(commitments, month), [commitments, month])
  const nextMonths = useMemo(() => nextNMonthKeys(6), [])
  const commitmentProjection = useMemo(() => projectByMonth(commitments, nextMonths), [commitments, nextMonths])
  const commitmentsThisMonth = useMemo(() => {
    const list = commitments.filter(c => {
      if (!c.active) return false
      if (month < c.start_month) return false
      if (c.end_month && month > c.end_month) return false
      return true
    })
    return commitmentFilter === 'todos' ? list : list.filter(c => c.type === commitmentFilter)
  }, [commitments, month, commitmentFilter])

  if (loading) return <p className="muted">Carregando…</p>
  if (error) return <div className="alert critical">{error}</div>

  if (txs.length === 0 && debts.length === 0 && commitments.length === 0 && accounts.length === 0) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div className="card">
          <h2>Bem-vindo! Comece por aqui:</h2>
          <ol style={{ lineHeight: 2 }}>
            <li>Crie suas contas em <Link to="/config">Configurações</Link> (ex.: Santander, Nubank, Mercado Pago)</li>
            <li>Importe seu primeiro extrato em <Link to="/conciliacao">Conciliação</Link></li>
            <li>Cadastre suas dívidas em <Link to="/dividas">Dívidas</Link> para montar o plano de quitação</li>
            <li>Cadastre parcelamentos e recorrentes em <Link to="/orcamento">Orçamento</Link> (compromissos já sabidos, tipo fatura de cartão)</li>
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
      {lateCommitments.length > 0 && (
        <div className="alert critical"><b>Parcelamentos atrasados:</b> {lateCommitments.map(c => c.name).join(', ')}.</div>
      )}
      {dueSoonDebts.length > 0 && (
        <div className="alert"><b>Vencimento próximo:</b> {dueSoonDebts.map(d => `${d.name} (dia ${d.due_day})`).join(', ')}.</div>
      )}
      {endingCommitments.length > 0 && (
        <div className="alert good"><b>Boa notícia:</b> {endingCommitments.map(c => c.name).join(', ')} {endingCommitments.length > 1 ? 'quitam' : 'quita'} este mês.</div>
      )}

      {score !== null && (
        <div className="card">
          <Meter value={score} label="Saúde financeira" />
        </div>
      )}

      <div className="grid tiles">
        <StatTile label="Receitas do mês" value={brl(income)} />
        <StatTile label="Despesas do mês" value={brl(expense)} />
        <StatTile label="Saldo do mês" value={brl(income - expense)} tone={income - expense >= 0 ? 'good' : 'bad'} />
        <StatTile label="Taxa de poupança" value={ind.savingsRate === null ? '—' : pct(ind.savingsRate)}
          hint="meta: 10–20% da renda" tone={ind.savingsRate !== null && ind.savingsRate >= 0.1 ? 'good' : ind.savingsRate !== null && ind.savingsRate < 0 ? 'bad' : 'neutral'} />
      </div>
      <div className="grid tiles">
        <StatTile label="Patrimônio líquido" value={brl(netWorth)} hint="reserva/poupança − dívida total" tone={netWorth >= 0 ? 'good' : 'bad'} />
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
      <div className="grid tiles">
        <StatTile label="Parcelamentos este mês" value={brl(commitmentTotals.parcelamento)} hint={`${commitmentTotals.parcelamentoCount} item(ns)`} />
        <StatTile label="Recorrentes este mês" value={brl(commitmentTotals.recorrente)} hint={`${commitmentTotals.recorrenteCount} item(ns)`} />
      </div>

      <div className="card">
        <h2>Receitas × Despesas — últimos 12 meses</h2>
        <MonthlyBars data={series} />
      </div>

      <div className="card">
        <h2>Patrimônio líquido — últimos 12 meses</h2>
        <p className="muted">Estimado a partir do saldo atual (reserva/poupança − dívida total) e do fluxo de caixa de cada mês — não considera valorização de investimentos.</p>
        <TrendLine data={netWorthSeries} />
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

      <div className="card">
        <h2>Fixo × variável (mês)</h2>
        <CompositionBar segments={[
          { label: 'Custo fixo', value: fixedVsVariable.fixed, color: 'var(--series-1)' },
          { label: 'Variável', value: fixedVsVariable.variable, color: 'var(--series-2)' },
        ]} />
      </div>

      <div className="card">
        <h2>Compromissos — próximos 6 meses</h2>
        <p className="muted">Parcelamentos de cartão e recorrentes já cadastrados, projetados mês a mês (cadastre em <Link to="/orcamento">Orçamento</Link>).</p>
        {commitments.length > 0
          ? <StackedMonthlyBars data={commitmentProjection} />
          : <p className="muted">Nenhum compromisso cadastrado ainda.</p>}
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Compromissos deste mês</h2>
        </div>
        <div className="chips">
          <button className={`chip ${commitmentFilter === 'todos' ? 'active' : ''}`} onClick={() => setCommitmentFilter('todos')}>Todos</button>
          <button className={`chip ${commitmentFilter === 'parcelamento' ? 'active' : ''}`} onClick={() => setCommitmentFilter('parcelamento')}>Parcelamentos</button>
          <button className={`chip ${commitmentFilter === 'recorrente' ? 'active' : ''}`} onClick={() => setCommitmentFilter('recorrente')}>Recorrentes</button>
        </div>
        <HBarList items={commitmentsThisMonth.map(c => ({ name: c.name, total: c.monthly_amount }))} />
      </div>
    </div>
  )
}
