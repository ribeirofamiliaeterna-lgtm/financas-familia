import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureDefaultCategories, fetchAccounts } from '../lib/data'
import { Account, Category } from '../lib/types'
import { brl } from '../lib/format'

const ACC_TYPES = {
  corrente: 'Conta corrente', poupanca: 'Poupança', reserva: 'Reserva de emergência',
  cartao: 'Cartão de crédito', dinheiro: 'Dinheiro',
} as const

/** Configurações: contas bancárias (com saldo p/ reserva) e categorias. */
export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [error, setError] = useState('')

  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState<Account['type']>('corrente')
  const [catName, setCatName] = useState('')
  const [catGrp, setCatGrp] = useState('')
  const [catKind, setCatKind] = useState<'despesa' | 'receita'>('despesa')
  const [catFixed, setCatFixed] = useState(false)

  const load = () => Promise.all([fetchAccounts(), ensureDefaultCategories()])
    .then(([a, c]) => { setAccounts(a); setCats(c) })
    .catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  const addAccount = async () => {
    if (!accName.trim()) return
    const { error } = await supabase().from('accounts').insert({ name: accName.trim(), type: accType })
    if (error) { setError(error.message); return }
    setAccName(''); load()
  }

  const updateBalance = async (a: Account, value: string) => {
    const balance = parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0
    const { error } = await supabase().from('accounts').update({ balance }).eq('id', a.id)
    if (error) setError(error.message)
    else setAccounts(list => list.map(x => (x.id === a.id ? { ...x, balance } : x)))
  }

  const removeAccount = async (a: Account) => {
    if (!window.confirm(`Excluir a conta "${a.name}"? As transações dela ficam sem conta vinculada.`)) return
    const { error } = await supabase().from('accounts').delete().eq('id', a.id)
    if (error) { setError(error.message); return }
    load()
  }

  const addCategory = async () => {
    if (!catName.trim() || !catGrp.trim()) { setError('Preencha nome e grupo da categoria.'); return }
    const { error } = await supabase().from('categories').insert({
      name: catName.trim(), grp: catGrp.trim(), kind: catKind, fixed: catFixed,
    })
    if (error) { setError(error.message); return }
    setCatName(''); load()
  }

  const removeCategory = async (c: Category) => {
    if (!window.confirm(`Excluir a categoria "${c.name}"? Transações e regras vinculadas perdem a referência.`)) return
    const { error } = await supabase().from('categories').delete().eq('id', c.id)
    if (error) { setError(error.message); return }
    load()
  }

  const groups = [...new Set(cats.map(c => c.grp))].sort()

  return (
    <div>
      <h1>Configurações</h1>
      <p className="subtitle">Contas, saldos e categorias.</p>
      {error && <div className="alert critical">{error}</div>}

      <div className="card">
        <h2>Contas</h2>
        <p className="muted">O saldo das contas do tipo "Reserva de emergência" e "Poupança" alimenta o indicador de reserva no Dashboard. Atualize-o quando quiser.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={accName} onChange={e => setAccName(e.target.value)} placeholder="ex.: Santander" />
          <select value={accType} onChange={e => setAccType(e.target.value as Account['type'])}>
            {Object.entries(ACC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="primary" onClick={addAccount}>Adicionar conta</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Tipo</th><th className="num">Saldo atual</th><th></th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="muted">{ACC_TYPES[a.type]}</td>
                  <td className="num">
                    <input className="amount" key={a.id + a.balance} defaultValue={a.balance ? a.balance.toFixed(2).replace('.', ',') : ''}
                      placeholder="0,00" onBlur={e => updateBalance(a, e.target.value)} />
                  </td>
                  <td><button className="ghost" onClick={() => removeAccount(a)}>🗑</button></td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma conta — crie a primeira acima.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Categorias</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="nome, ex.: Pet" />
          <input value={catGrp} onChange={e => setCatGrp(e.target.value)} placeholder="grupo, ex.: Pessoal" list="grupos" />
          <datalist id="grupos">{groups.map(g => <option key={g} value={g} />)}</datalist>
          <select value={catKind} onChange={e => setCatKind(e.target.value as any)}>
            <option value="despesa">Despesa</option><option value="receita">Receita</option>
          </select>
          <label className="row" style={{ gap: 4 }}>
            <input type="checkbox" checked={catFixed} onChange={e => setCatFixed(e.target.checked)} /> custo fixo
          </label>
          <button className="primary" onClick={addCategory}>Adicionar</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Grupo</th><th>Categoria</th><th>Tipo</th><th>Fixo</th><th></th></tr></thead>
            <tbody>
              {cats.map(c => (
                <tr key={c.id}>
                  <td className="muted">{c.grp}</td>
                  <td>{c.name}</td>
                  <td className="muted">{c.kind}</td>
                  <td>{c.fixed ? '✓' : ''}</td>
                  <td><button className="ghost" onClick={() => removeCategory(c)}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
