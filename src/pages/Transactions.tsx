import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureDefaultCategories, fetchAccounts, fetchTransactions } from '../lib/data'
import { Account, Category, Transaction } from '../lib/types'
import { addMonths, brl, currentMonthKey, dateBR, monthLabelLong } from '../lib/format'
import { normalizeDescription, txHash } from '../lib/normalize'
import { groupOptions } from './Import'

export default function Transactions() {
  const [month, setMonth] = useState(currentMonthKey())
  const [txs, setTxs] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filter, setFilter] = useState('')
  const [onlyUncat, setOnlyUncat] = useState(false)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)

  const load = async (m: string) => {
    try {
      const [t, c, a] = await Promise.all([
        fetchTransactions(m, addMonths(m, 1)),
        ensureDefaultCategories(),
        fetchAccounts(),
      ])
      setTxs(t.filter(x => x.date < addMonths(m, 1)))
      setCats(c); setAccounts(a)
    } catch (e: any) { setError(e.message) }
  }
  useEffect(() => { load(month) }, [month])

  const catById = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])

  const shown = useMemo(() => txs.filter(t => {
    if (onlyUncat && t.category_id) return false
    if (filter && !t.description.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  }), [txs, filter, onlyUncat])

  const setCategory = async (t: Transaction, categoryId: string | null) => {
    setTxs(list => list.map(x => (x.id === t.id ? { ...x, category_id: categoryId } : x)))
    const { error } = await supabase().from('transactions').update({ category_id: categoryId }).eq('id', t.id)
    if (error) setError(error.message)
  }

  const remove = async (t: Transaction) => {
    if (!window.confirm(`Excluir "${t.description}" de ${brl(t.amount)}?`)) return
    const { error } = await supabase().from('transactions').delete().eq('id', t.id)
    if (error) { setError(error.message); return }
    setTxs(list => list.filter(x => x.id !== t.id))
  }

  const income = shown.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = shown.filter(t => t.amount < 0).reduce((s, t) => s + -t.amount, 0)

  return (
    <div>
      <h1>Transações</h1>
      <p className="subtitle">{monthLabelLong(month)} — {shown.length} lançamentos · receitas {brl(income)} · despesas {brl(expense)}</p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={() => setMonth(addMonths(month, -1))}>← mês anterior</button>
        <button className="ghost" onClick={() => setMonth(addMonths(month, 1))}>mês seguinte →</button>
        <input placeholder="filtrar descrição…" value={filter} onChange={e => setFilter(e.target.value)} />
        <label className="row" style={{ gap: 4 }}>
          <input type="checkbox" checked={onlyUncat} onChange={e => setOnlyUncat(e.target.checked)} /> só sem categoria
        </label>
        <button className="primary" onClick={() => setShowNew(v => !v)}>{showNew ? 'Fechar' : '+ Lançamento manual'}</button>
      </div>

      {error && <div className="alert critical">{error}</div>}
      {showNew && <NewTransaction cats={cats} accounts={accounts} onSaved={() => { setShowNew(false); load(month) }} />}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Conta</th><th className="num">Valor</th><th>Categoria</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map(t => (
              <tr key={t.id}>
                <td className="mono">{dateBR(t.date)}</td>
                <td>{t.description}</td>
                <td className="muted">{accounts.find(a => a.id === t.account_id)?.name ?? '—'}</td>
                <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{brl(t.amount)}</td>
                <td>
                  <select value={t.category_id ?? ''} onChange={e => setCategory(t, e.target.value || null)}>
                    <option value="">— a classificar —</option>
                    {groupOptions(cats, t.amount)}
                  </select>
                </td>
                <td><button className="ghost" title="Excluir" onClick={() => remove(t)}>🗑</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">Nenhum lançamento neste mês.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NewTransaction({ cats, accounts, onSaved }: { cats: Category[]; accounts: Account[]; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [kind, setKind] = useState<'despesa' | 'receita'>('despesa')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    const raw = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
    if (!description.trim() || isNaN(raw) || raw <= 0) { setError('Preencha descrição e valor válido.'); return }
    const amount = kind === 'despesa' ? -Math.abs(raw) : Math.abs(raw)
    const normalized = normalizeDescription(description)
    const { error } = await supabase().from('transactions').insert({
      date, description, normalized, amount,
      category_id: categoryId || null,
      account_id: accountId || null,
      status: 'confirmada', source: 'manual',
      hash: txHash(accountId || null, date, amount, normalized + Date.now()),
    })
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div className="card">
      <h2>Novo lançamento manual</h2>
      <div className="row">
        <label className="field"><span>Data</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field"><span>Descrição</span><input value={description} onChange={e => setDescription(e.target.value)} placeholder="ex.: Feira da semana" /></label>
        <label className="field"><span>Tipo</span>
          <select value={kind} onChange={e => setKind(e.target.value as any)}>
            <option value="despesa">Despesa</option><option value="receita">Receita</option>
          </select>
        </label>
        <label className="field"><span>Valor (R$)</span><input className="amount" value={amountStr} onChange={e => setAmountStr(e.target.value)} placeholder="0,00" /></label>
        <label className="field"><span>Categoria</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">— escolher —</option>
            {groupOptions(cats, kind === 'despesa' ? -1 : 1)}
          </select>
        </label>
        <label className="field"><span>Conta</span>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="neg">{error}</p>}
      <button className="primary" onClick={save}>Salvar</button>
    </div>
  )
}
