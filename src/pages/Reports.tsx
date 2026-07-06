import { useEffect, useMemo, useState } from 'react'
import { ensureDefaultCategories, fetchTransactions } from '../lib/data'
import { detectRecurring, expenseByCategory, topMerchants } from '../lib/indicators'
import { Category, Transaction } from '../lib/types'
import { brl, currentMonthKey, lastNMonthKeys, monthLabel, toMonthKey } from '../lib/format'
import { HBarList } from '../components/charts'

/**
 * RELATÓRIOS: evolução mensal por grupo/categoria, auditoria de assinaturas
 * e recorrências, top estabelecimentos e exportação CSV.
 */
export default function Reports() {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [nMonths, setNMonths] = useState(6)

  const months = useMemo(() => lastNMonthKeys(nMonths), [nMonths])

  useEffect(() => {
    Promise.all([fetchTransactions(lastNMonthKeys(12)[0]), ensureDefaultCategories()])
      .then(([t, c]) => { setTxs(t); setCats(c) })
      .catch(e => setError(e.message))
  }, [])

  const periodTxs = useMemo(() => txs.filter(t => toMonthKey(t.date) >= months[0]), [txs, months])

  // matriz grupo × mês
  const matrix = useMemo(() => {
    const catById = new Map(cats.map(c => [c.id, c]))
    const rows = new Map<string, Map<string, number>>()
    for (const t of periodTxs) {
      if (t.amount >= 0) continue
      const grp = t.category_id ? (catById.get(t.category_id)?.grp ?? 'Outros') : 'Sem categoria'
      const m = toMonthKey(t.date)
      const row = rows.get(grp) ?? new Map<string, number>()
      row.set(m, (row.get(m) ?? 0) + -t.amount)
      rows.set(grp, row)
    }
    return [...rows.entries()]
      .map(([grp, byMonth]) => ({
        grp, byMonth,
        total: [...byMonth.values()].reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [periodTxs, cats, months])

  const recurring = useMemo(() => detectRecurring(periodTxs).slice(0, 15), [periodTxs])
  const merchants = useMemo(() => topMerchants(periodTxs, 10), [periodTxs])
  const catById = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])

  const exportCSV = () => {
    const catName = (id: string | null) => (id ? catById.get(id)?.name ?? '' : '')
    const catGrp = (id: string | null) => (id ? catById.get(id)?.grp ?? '' : '')
    const lines = [
      'data;descricao;valor;categoria;grupo',
      ...periodTxs.map(t => [t.date, `"${t.description.replace(/"/g, "'")}"`, String(t.amount).replace('.', ','), catName(t.category_id), catGrp(t.category_id)].join(';')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `transacoes-${currentMonthKey().slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <h1>Relatórios</h1>
      <p className="subtitle">Análise dos últimos {nMonths} meses.</p>

      <div className="row" style={{ marginBottom: 12 }}>
        <select value={nMonths} onChange={e => setNMonths(parseInt(e.target.value, 10))}>
          <option value={3}>últimos 3 meses</option>
          <option value={6}>últimos 6 meses</option>
          <option value={12}>últimos 12 meses</option>
        </select>
        <button onClick={exportCSV}>Exportar CSV (Excel)</button>
      </div>

      {error && <div className="alert critical">{error}</div>}

      <div className="card table-wrap">
        <h2>Evolução por grupo (despesas)</h2>
        <table>
          <thead>
            <tr>
              <th>Grupo</th>
              {months.map(m => <th className="num" key={m}>{monthLabel(m)}</th>)}
              <th className="num">Total</th>
              <th className="num">Média</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(r => (
              <tr key={r.grp}>
                <td>{r.grp}</td>
                {months.map(m => <td className="num" key={m}>{r.byMonth.get(m) ? brl(r.byMonth.get(m)!) : '—'}</td>)}
                <td className="num"><b>{brl(r.total)}</b></td>
                <td className="num">{brl(r.total / months.length)}</td>
              </tr>
            ))}
            {matrix.length === 0 && <tr><td colSpan={months.length + 3} className="muted">Sem despesas no período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Auditoria de recorrências</h2>
          <p className="muted">Gastos que se repetem todo mês — os melhores candidatos a corte (assinaturas, mensalidades, tarifas).</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lançamento</th><th className="num">Meses</th><th className="num">Média/mês</th><th className="num">Custo/ano</th></tr></thead>
              <tbody>
                {recurring.map(r => (
                  <tr key={r.normalized}>
                    <td>{r.description}<div className="muted">{r.categoryId ? catById.get(r.categoryId)?.name : 'sem categoria'}</div></td>
                    <td className="num">{r.months}</td>
                    <td className="num">{brl(r.avgAmount)}</td>
                    <td className="num neg">{brl(r.avgAmount * 12)}</td>
                  </tr>
                ))}
                {recurring.length === 0 && <tr><td colSpan={4} className="muted">Nada recorrente detectado ainda (precisa de 2+ meses de dados).</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Top estabelecimentos do período</h2>
          <HBarList items={merchants.map(m => ({ name: m.name, total: m.total }))} maxItems={10} />
        </div>
      </div>
    </div>
  )
}
