import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureDefaultCategories, fetchBudgets, fetchTransactions, upsertBudget } from '../lib/data'
import { expenseByCategory } from '../lib/indicators'
import { Budget, Category, Transaction } from '../lib/types'
import { addMonths, brl, currentMonthKey, monthLabelLong } from '../lib/format'
import { BulletBudget } from '../components/charts'

/**
 * ORÇAMENTO (orçado × realizado) — o "forecast" vivo:
 * defina quanto pretende gastar em cada categoria no mês e acompanhe
 * o realizado preenchendo automaticamente a partir das transações.
 */
export default function BudgetPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const [cats, setCats] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = async (m: string) => {
    try {
      const [c, b, t] = await Promise.all([
        ensureDefaultCategories(),
        fetchBudgets(m),
        fetchTransactions(m, addMonths(m, 1)),
      ])
      setCats(c); setBudgets(b); setTxs(t.filter(x => x.date < addMonths(m, 1)))
    } catch (e: any) { setError(e.message) }
  }
  useEffect(() => { setCopied(''); load(month) }, [month])

  const budgetByCat = useMemo(() => new Map(budgets.map(b => [b.category_id, b.amount])), [budgets])
  const actualByCat = useMemo(() => {
    const list = expenseByCategory(txs, cats, month)
    return new Map(list.map(c => [c.categoryId, c.total]))
  }, [txs, cats, month])

  const groups = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const c of cats.filter(c => c.kind === 'despesa')) {
      const list = map.get(c.grp) ?? []
      list.push(c)
      map.set(c.grp, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [cats])

  const totals = useMemo(() => {
    let budget = 0, actual = 0
    for (const c of cats.filter(c => c.kind === 'despesa')) {
      budget += budgetByCat.get(c.id) ?? 0
      actual += actualByCat.get(c.id) ?? 0
    }
    return { budget, actual }
  }, [cats, budgetByCat, actualByCat])

  const save = async (categoryId: string, value: string) => {
    const amount = parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0
    try {
      await upsertBudget(categoryId, month, amount)
      setBudgets(list => {
        const existing = list.find(b => b.category_id === categoryId)
        if (existing) return list.map(b => (b.category_id === categoryId ? { ...b, amount } : b))
        return [...list, { id: 'tmp' + categoryId, category_id: categoryId, month, amount }]
      })
    } catch (e: any) { setError(e.message) }
  }

  const copyPrevious = async () => {
    try {
      const prev = await fetchBudgets(addMonths(month, -1))
      const { data: userData } = await supabase().auth.getUser()
      const rows = prev.filter(b => b.amount > 0).map(b => ({
        user_id: userData.user!.id, category_id: b.category_id, month, amount: b.amount,
      }))
      if (rows.length === 0) { setCopied('O mês anterior não tem orçamento definido.'); return }
      const { error } = await supabase().from('budgets').upsert(rows, { onConflict: 'user_id,category_id,month' })
      if (error) throw error
      setCopied(`${rows.length} valores copiados do mês anterior.`)
      load(month)
    } catch (e: any) { setError(e.message) }
  }

  return (
    <div>
      <h1>Orçamento — orçado × realizado</h1>
      <p className="subtitle">{monthLabelLong(month)} · orçado {brl(totals.budget)} · realizado {brl(totals.actual)} ({totals.budget > 0 ? Math.round((totals.actual / totals.budget) * 100) : 0}%)</p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={() => setMonth(addMonths(month, -1))}>← mês anterior</button>
        <button className="ghost" onClick={() => setMonth(addMonths(month, 1))}>mês seguinte →</button>
        <button onClick={copyPrevious}>Copiar orçamento do mês anterior</button>
        {copied && <span className="muted">{copied}</span>}
      </div>

      {error && <div className="alert critical">{error}</div>}

      {groups.map(([grp, list]) => {
        const gBudget = list.reduce((s, c) => s + (budgetByCat.get(c.id) ?? 0), 0)
        const gActual = list.reduce((s, c) => s + (actualByCat.get(c.id) ?? 0), 0)
        return (
          <div className="card" key={grp}>
            <div className="row between">
              <h2>{grp}</h2>
              <span className={`mono ${gActual > gBudget && gBudget > 0 ? 'neg' : ''}`}>{brl(gActual)} / {brl(gBudget)}</span>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  {list.map(c => {
                    const b = budgetByCat.get(c.id) ?? 0
                    const a = actualByCat.get(c.id) ?? 0
                    const diff = b - a
                    return (
                      <tr key={c.id}>
                        <td style={{ width: 200 }}>{c.name}</td>
                        <td style={{ width: 130 }}>
                          <input className="amount" defaultValue={b > 0 ? b.toFixed(2).replace('.', ',') : ''}
                            key={`${c.id}-${month}-${b}`}
                            placeholder="0,00" onBlur={e => save(c.id, e.target.value)} />
                        </td>
                        <td><BulletBudget actual={a} budget={b} /></td>
                        <td className={`num ${a > b && b > 0 ? 'neg' : ''}`} style={{ width: 110 }}>{brl(a)}</td>
                        <td className={`num ${diff < 0 ? 'neg' : 'pos'}`} style={{ width: 110 }}>{b > 0 ? brl(diff) : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
