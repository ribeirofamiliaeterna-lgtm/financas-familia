import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createCategory, ensureDefaultCategories, fetchBudgets, fetchTransactions, upsertBudget } from '../lib/data'
import { createCommitment, CommitmentInput, deleteCommitment, fetchCommitments, totalsByCategory, totalsByType, updateCommitment } from '../lib/commitments'
import { expenseByCategory } from '../lib/indicators'
import { Budget, Category, Commitment, Transaction } from '../lib/types'
import { addMonths, brl, currentMonthKey, monthLabelLong } from '../lib/format'
import { BulletBudget, StatTile } from '../components/charts'
import { EditIcon, PlusIcon, TrashIcon } from '../components/icons'

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
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [showSection, setShowSection] = useState(false)

  const load = async (m: string) => {
    try {
      const [c, b, t, cm] = await Promise.all([
        ensureDefaultCategories(),
        fetchBudgets(m),
        fetchTransactions(m, addMonths(m, 1)),
        fetchCommitments(),
      ])
      setCats(c); setBudgets(b); setTxs(t.filter(x => x.date < addMonths(m, 1))); setCommitments(cm)
    } catch (e: any) { setError(e.message) }
  }
  useEffect(() => { setCopied(''); load(month) }, [month])

  const budgetByCat = useMemo(() => new Map(budgets.map(b => [b.category_id, b.amount])), [budgets])
  const actualByCat = useMemo(() => {
    const list = expenseByCategory(txs, cats, month)
    return new Map(list.map(c => [c.categoryId, c.total]))
  }, [txs, cats, month])
  const suggestedByCat = useMemo(() => totalsByCategory(commitments, month), [commitments, month])

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

  const addSection = async (sectionName: string, firstCategory: string) => {
    try {
      await createCategory(firstCategory, sectionName, 'despesa', false)
      setShowSection(false)
      load(month)
    } catch (e: any) { setError(e.message) }
  }

  return (
    <div>
      <div className="row between">
        <div>
          <h1>Orçamento — orçado × realizado</h1>
          <p className="subtitle">{monthLabelLong(month)} · orçado {brl(totals.budget)} · realizado {brl(totals.actual)} ({totals.budget > 0 ? Math.round((totals.actual / totals.budget) * 100) : 0}%)</p>
        </div>
        <button className="ghost" onClick={() => setShowSection(v => !v)}><PlusIcon /> nova seção</button>
      </div>

      {showSection && <NewSectionForm onSave={addSection} onCancel={() => setShowSection(false)} />}

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={() => setMonth(addMonths(month, -1))}>← mês anterior</button>
        <button className="ghost" onClick={() => setMonth(addMonths(month, 1))}>mês seguinte →</button>
        <button onClick={copyPrevious}>Copiar orçamento do mês anterior</button>
        {copied && <span className="muted">{copied}</span>}
      </div>

      {error && <div className="alert critical">{error}</div>}

      <CommitmentsCard month={month} cats={cats} commitments={commitments} onChanged={() => load(month)} setError={setError} />

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
                    const suggested = suggestedByCat.get(c.id) ?? 0
                    return (
                      <tr key={c.id}>
                        <td style={{ width: 200 }}>
                          {c.name}
                          {suggested > 0 && Math.round(suggested) !== Math.round(b) && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              sugerido: {brl(suggested)}{' '}
                              <button className="ghost" style={{ padding: '0 4px', fontSize: 11 }} onClick={() => save(c.id, String(suggested).replace('.', ','))}>usar</button>
                            </div>
                          )}
                        </td>
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
            <AddCategoryRow grp={grp} onAdded={() => load(month)} setError={setError} />
          </div>
        )
      })}
    </div>
  )
}

function NewSectionForm({ onSave, onCancel }: { onSave: (section: string, category: string) => void; onCancel: () => void }) {
  const [section, setSection] = useState('')
  const [category, setCategory] = useState('')
  return (
    <div className="card">
      <h2>Nova seção</h2>
      <p className="muted">Cria um grupo novo no orçamento com a primeira categoria dele.</p>
      <div className="row">
        <label className="field"><span>Nome da seção</span><input value={section} onChange={e => setSection(e.target.value)} placeholder="ex.: Investimentos" /></label>
        <label className="field"><span>Primeira categoria</span><input value={category} onChange={e => setCategory(e.target.value)} placeholder="ex.: Aportes" /></label>
      </div>
      <div className="row">
        <button className="primary" disabled={!section.trim() || !category.trim()} onClick={() => onSave(section.trim(), category.trim())}>Criar seção</button>
        <button className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function AddCategoryRow({ grp, onAdded, setError }: { grp: string; onAdded: () => void; setError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [fixed, setFixed] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    try {
      await createCategory(name.trim(), grp, 'despesa', fixed)
      setName(''); setFixed(false); setOpen(false)
      onAdded()
    } catch (e: any) { setError(e.message) }
  }

  if (!open) return <button className="ghost" style={{ marginTop: 6 }} onClick={() => setOpen(true)}><PlusIcon /> nova categoria em {grp}</button>
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="nome da categoria" autoFocus />
      <label className="row" style={{ gap: 4 }}>
        <input type="checkbox" checked={fixed} onChange={e => setFixed(e.target.checked)} /> custo fixo
      </label>
      <button className="primary" onClick={add}>Adicionar</button>
      <button className="ghost" onClick={() => setOpen(false)}>Cancelar</button>
    </div>
  )
}

type Filter = 'todos' | 'parcelamento' | 'recorrente'

function CommitmentsCard({ month, cats, commitments, onChanged, setError }: {
  month: string; cats: Category[]; commitments: Commitment[]; onChanged: () => void; setError: (m: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('todos')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Commitment | null>(null)

  const catById = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])
  const totals = useMemo(() => totalsByType(commitments, month), [commitments, month])

  const inMonth = useMemo(() => commitments.filter(c => {
    if (!c.active) return false
    if (month < c.start_month) return false
    if (c.end_month && month > c.end_month) return false
    return true
  }), [commitments, month])

  const shown = useMemo(() => filter === 'todos' ? inMonth : inMonth.filter(c => c.type === filter), [inMonth, filter])

  const remove = async (c: Commitment) => {
    if (!window.confirm(`Excluir o compromisso "${c.name}"?`)) return
    try { await deleteCommitment(c.id); onChanged() } catch (e: any) { setError(e.message) }
  }

  const installmentLabel = (c: Commitment) => {
    if (c.type !== 'parcelamento' || !c.installments_count) return '—'
    const idx = monthsBetween(c.start_month, month) + 1
    return `${idx}/${c.installments_count}`
  }

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Compromissos deste mês</h2>
        <button className="primary" onClick={() => { setEditing(null); setShowForm(v => !v) }}>{showForm ? 'Fechar' : '+ Novo compromisso'}</button>
      </div>
      <p className="muted">Parcelamentos de cartão e despesas recorrentes cadastrados uma vez — o valor mensal é projetado automaticamente.</p>

      <div className="grid tiles">
        <StatTile label="Parcelamentos este mês" value={brl(totals.parcelamento)} hint={`${totals.parcelamentoCount} item(ns)`} />
        <StatTile label="Recorrentes este mês" value={brl(totals.recorrente)} hint={`${totals.recorrenteCount} item(ns)`} />
      </div>

      <div className="chips">
        <button className={`chip ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos</button>
        <button className={`chip ${filter === 'parcelamento' ? 'active' : ''}`} onClick={() => setFilter('parcelamento')}>Parcelamentos</button>
        <button className={`chip ${filter === 'recorrente' ? 'active' : ''}`} onClick={() => setFilter('recorrente')}>Recorrentes</button>
      </div>

      {showForm && (
        <CommitmentForm cats={cats} commitment={editing} month={month}
          onSaved={() => { setShowForm(false); setEditing(null); onChanged() }} setError={setError} />
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nome</th><th>Tipo</th><th>Categoria</th><th className="num">Valor/mês</th><th>Parcela</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map(c => (
              <tr key={c.id}>
                <td>{c.name} {c.late && <span className="badge dup">atrasado</span>}</td>
                <td><span className={`badge ${c.type === 'parcelamento' ? 'rule' : 'hist'}`}>{c.type === 'parcelamento' ? 'parcelamento' : 'recorrente'}</span></td>
                <td className="muted">{c.category_id ? catById.get(c.category_id)?.name ?? '—' : '—'}</td>
                <td className="num">{brl(c.monthly_amount)}</td>
                <td className="muted">{installmentLabel(c)}</td>
                <td>
                  <button className="ghost" title="Editar" onClick={() => { setEditing(c); setShowForm(true) }}><EditIcon /></button>
                  <button className="ghost" title="Excluir" onClick={() => remove(c)}><TrashIcon /></button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">Nenhum compromisso {filter !== 'todos' ? `do tipo "${filter}"` : ''} neste mês.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

function CommitmentForm({ cats, commitment, month, onSaved, setError }: {
  cats: Category[]; commitment: Commitment | null; month: string; onSaved: () => void; setError: (m: string) => void
}) {
  const [name, setName] = useState(commitment?.name ?? '')
  const [type, setType] = useState<Commitment['type']>(commitment?.type ?? 'parcelamento')
  const [categoryId, setCategoryId] = useState(commitment?.category_id ?? '')
  const [amountStr, setAmountStr] = useState(commitment ? String(commitment.monthly_amount).replace('.', ',') : '')
  const [startMonth, setStartMonth] = useState((commitment?.start_month ?? month).slice(0, 7))
  const [installments, setInstallments] = useState(commitment?.installments_count ? String(commitment.installments_count) : '')
  const [late, setLate] = useState(commitment?.late ?? false)
  const [error, setLocalError] = useState('')

  const expenseCats = cats.filter(c => c.kind === 'despesa')

  const save = async () => {
    const amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0
    if (!name.trim() || amount <= 0) { setLocalError('Preencha nome e valor mensal.'); return }
    if (type === 'parcelamento' && (!installments || parseInt(installments, 10) <= 0)) {
      setLocalError('Informe o número de parcelas.'); return
    }
    const input: CommitmentInput = {
      name: name.trim(), type, category_id: categoryId || null,
      monthly_amount: amount, start_month: `${startMonth}-01`,
      installments_count: type === 'parcelamento' ? parseInt(installments, 10) : null,
      late, active: true,
    }
    try {
      if (commitment) await updateCommitment(commitment.id, input)
      else await createCommitment(input)
      onSaved()
    } catch (e: any) { setError(e.message) }
  }

  return (
    <div style={{ borderBottom: '1px solid var(--grid)', paddingBottom: 12, marginBottom: 12 }}>
      <div className="row">
        <label className="field"><span>Nome</span><input value={name} onChange={e => setName(e.target.value)} placeholder="ex.: Cartão Nubank — Notebook" style={{ width: 220 }} /></label>
        <label className="field"><span>Tipo</span>
          <select value={type} onChange={e => setType(e.target.value as Commitment['type'])}>
            <option value="parcelamento">Parcelamento</option>
            <option value="recorrente">Recorrente</option>
          </select>
        </label>
        <label className="field"><span>Categoria</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">— sem categoria —</option>
            {expenseCats.map(c => <option key={c.id} value={c.id}>{c.grp} · {c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Valor mensal (R$)</span><input className="amount" value={amountStr} onChange={e => setAmountStr(e.target.value)} /></label>
        <label className="field"><span>Mês de início</span><input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} /></label>
        {type === 'parcelamento' && (
          <label className="field"><span>Nº de parcelas</span><input className="amount" value={installments} onChange={e => setInstallments(e.target.value)} placeholder="ex.: 10" /></label>
        )}
        {type === 'parcelamento' && (
          <label className="row" style={{ gap: 4, alignSelf: 'flex-end', marginBottom: 10 }}>
            <input type="checkbox" checked={late} onChange={e => setLate(e.target.checked)} /> atrasado
          </label>
        )}
      </div>
      {error && <p className="neg">{error}</p>}
      <button className="primary" onClick={save}>{commitment ? 'Salvar alterações' : 'Adicionar compromisso'}</button>
    </div>
  )
}
