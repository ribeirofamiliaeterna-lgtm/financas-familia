import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchDebts } from '../lib/data'
import { simulatePayoff, Strategy } from '../lib/debts'
import { Debt } from '../lib/types'
import { brl } from '../lib/format'
import { PayoffChart, StatTile } from '../components/charts'

const KINDS = { cartao: 'Cartão', financiamento: 'Financiamento', emprestimo: 'Empréstimo', outro: 'Outro' } as const

/**
 * PLANO DE QUITAÇÃO: cadastre cada dívida (saldo, juros mensais, parcela mínima)
 * e simule as estratégias Avalanche (maior juros primeiro — economiza mais)
 * e Snowball (menor saldo primeiro — vitórias rápidas).
 */
export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [error, setError] = useState('')
  const [extraStr, setExtraStr] = useState('500')
  const [strategy, setStrategy] = useState<Strategy>('avalanche')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Debt | null>(null)

  const load = () => fetchDebts().then(setDebts).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  const extra = parseFloat(extraStr.replace(/\./g, '').replace(',', '.')) || 0
  const totalBalance = debts.reduce((s, d) => s + d.balance, 0)
  const totalMin = debts.reduce((s, d) => s + d.min_payment, 0)

  const sim = useMemo(() => (debts.length ? simulatePayoff(debts, extra, strategy) : null), [debts, extra, strategy])
  const simAlt = useMemo(() => (debts.length ? simulatePayoff(debts, extra, strategy === 'avalanche' ? 'snowball' : 'avalanche') : null), [debts, extra, strategy])

  const chartSeries = useMemo(() => {
    if (!sim || !simAlt) return []
    const mk = (name: string, s: typeof sim) => ({
      name,
      points: [{ x: 0, y: totalBalance }, ...s.schedule.map(m => ({ x: m.monthIndex, y: m.totalBalance }))],
    })
    return strategy === 'avalanche'
      ? [mk('Avalanche (maior juros)', sim), mk('Snowball (menor saldo)', simAlt)]
      : [mk('Avalanche (maior juros)', simAlt), mk('Snowball (menor saldo)', sim)]
  }, [sim, simAlt, strategy, totalBalance])

  const remove = async (d: Debt) => {
    if (!window.confirm(`Excluir a dívida "${d.name}"?`)) return
    const { error } = await supabase().from('debts').delete().eq('id', d.id)
    if (error) { setError(error.message); return }
    load()
  }

  return (
    <div>
      <h1>Dívidas e plano de quitação</h1>
      <p className="subtitle">Cadastre cada dívida com o juro mensal e simule a saída. Prioridade: rotativo de cartão primeiro — é o juro mais caro do país.</p>

      {error && <div className="alert critical">{error}</div>}

      <div className="grid tiles">
        <StatTile label="Dívida total" value={brl(totalBalance)} tone={totalBalance > 0 ? 'bad' : 'good'} />
        <StatTile label="Parcelas mínimas / mês" value={brl(totalMin)} />
        {sim && sim.feasible && <StatTile label="Quitação em" value={`${sim.months} meses`} hint={`estratégia ${strategy === 'avalanche' ? 'avalanche' : 'snowball'}`} />}
        {sim && sim.feasible && <StatTile label="Juros até quitar" value={brl(sim.totalInterest)} />}
      </div>

      {sim && !sim.feasible && (
        <div className="alert critical">
          <b>Atenção:</b> com esse valor extra, a dívida cresce mais rápido do que você paga (os juros superam os pagamentos).
          Aumente o valor mensal ou renegocie as taxas — considere trocar rotativo por empréstimo pessoal com juro menor.
        </div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="field" style={{ margin: 0 }}><span>Valor extra por mês (além dos mínimos)</span>
            <input className="amount" value={extraStr} onChange={e => setExtraStr(e.target.value)} />
          </label>
          <label className="field" style={{ margin: 0 }}><span>Estratégia</span>
            <select value={strategy} onChange={e => setStrategy(e.target.value as Strategy)}>
              <option value="avalanche">Avalanche — maior juros primeiro (economiza mais)</option>
              <option value="snowball">Snowball — menor saldo primeiro (motivação)</option>
            </select>
          </label>
        </div>
        {sim && simAlt && sim.feasible && simAlt.feasible && (
          <p className="muted">
            Comparação: avalanche paga {brl(Math.abs((strategy === 'avalanche' ? simAlt : sim).totalInterest - (strategy === 'avalanche' ? sim : simAlt).totalInterest))} a menos de juros que snowball neste cenário.
          </p>
        )}
        {chartSeries.length > 0 && <PayoffChart series={chartSeries} xLabel="meses a partir de hoje" />}
        {sim && sim.feasible && sim.payoffOrder.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Ordem de quitação: {sim.payoffOrder.map(p => `${p.name} (mês ${p.month})`).join(' → ')}
          </p>
        )}
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Suas dívidas</h2>
          <button className="primary" onClick={() => { setEditing(null); setShowForm(v => !v) }}>{showForm ? 'Fechar' : '+ Nova dívida'}</button>
        </div>
        {showForm && <DebtForm debt={editing} onSaved={() => { setShowForm(false); setEditing(null); load() }} />}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>Tipo</th><th className="num">Saldo devedor</th><th className="num">Juros % a.m.</th><th className="num">Parcela mínima</th><th className="num">Venc.</th><th></th></tr>
            </thead>
            <tbody>
              {debts.map(d => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="muted">{KINDS[d.kind]}</td>
                  <td className="num neg">{brl(d.balance)}</td>
                  <td className="num">{d.monthly_rate.toLocaleString('pt-BR')}%</td>
                  <td className="num">{brl(d.min_payment)}</td>
                  <td className="num">{d.due_day ?? '—'}</td>
                  <td>
                    <button className="ghost" onClick={() => { setEditing(d); setShowForm(true) }}>✏️</button>
                    <button className="ghost" onClick={() => remove(d)}>🗑</button>
                  </td>
                </tr>
              ))}
              {debts.length === 0 && <tr><td colSpan={7} className="muted">Nenhuma dívida cadastrada. Cadastre cartões, FIES, financiamentos…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DebtForm({ debt, onSaved }: { debt: Debt | null; onSaved: () => void }) {
  const [name, setName] = useState(debt?.name ?? '')
  const [kind, setKind] = useState<Debt['kind']>(debt?.kind ?? 'cartao')
  const [balance, setBalance] = useState(debt ? String(debt.balance).replace('.', ',') : '')
  const [rate, setRate] = useState(debt ? String(debt.monthly_rate).replace('.', ',') : '')
  const [minPay, setMinPay] = useState(debt ? String(debt.min_payment).replace('.', ',') : '')
  const [dueDay, setDueDay] = useState(debt?.due_day ? String(debt.due_day) : '')
  const [error, setError] = useState('')

  const num = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à dívida.'); return }
    const row = {
      name: name.trim(), kind,
      balance: num(balance), monthly_rate: num(rate), min_payment: num(minPay),
      due_day: dueDay ? parseInt(dueDay, 10) : null,
    }
    const q = debt
      ? supabase().from('debts').update(row).eq('id', debt.id)
      : supabase().from('debts').insert(row)
    const { error } = await q
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div style={{ borderBottom: '1px solid var(--grid)', paddingBottom: 12, marginBottom: 12 }}>
      <div className="row">
        <label className="field"><span>Nome</span><input value={name} onChange={e => setName(e.target.value)} placeholder="ex.: Cartão Nubank" /></label>
        <label className="field"><span>Tipo</span>
          <select value={kind} onChange={e => setKind(e.target.value as Debt['kind'])}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Saldo devedor (R$)</span><input className="amount" value={balance} onChange={e => setBalance(e.target.value)} /></label>
        <label className="field"><span>Juros % ao mês</span><input className="amount" value={rate} onChange={e => setRate(e.target.value)} placeholder="ex.: 12,5" /></label>
        <label className="field"><span>Parcela mínima (R$)</span><input className="amount" value={minPay} onChange={e => setMinPay(e.target.value)} /></label>
        <label className="field"><span>Dia do vencimento</span><input className="amount" value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="ex.: 10" /></label>
      </div>
      {error && <p className="neg">{error}</p>}
      <button className="primary" onClick={save}>{debt ? 'Salvar alterações' : 'Adicionar dívida'}</button>
    </div>
  )
}
