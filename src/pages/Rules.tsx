import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureDefaultCategories, fetchRules } from '../lib/data'
import { normalizeDescription } from '../lib/normalize'
import { ruleMatches } from '../lib/rules'
import { Category, Rule } from '../lib/types'
import { groupOptions } from './Import'

/**
 * Regras de categorização: "se a descrição contém X, categoria = Y".
 * São criadas automaticamente na conciliação ao aceitar sugestões,
 * e podem ser gerenciadas manualmente aqui.
 */
export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [test, setTest] = useState('')

  const [pattern, setPattern] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const load = () => Promise.all([fetchRules(), ensureDefaultCategories()])
    .then(([r, c]) => { setRules(r); setCats(c) })
    .catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  const catById = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])

  const testNormalized = normalizeDescription(test)
  const testMatches = useMemo(
    () => (test ? new Set(rules.filter(r => ruleMatches(r, testNormalized)).map(r => r.id)) : new Set<string>()),
    [test, rules, testNormalized],
  )

  const add = async () => {
    if (!pattern.trim() || !categoryId) { setError('Preencha o padrão e a categoria.'); return }
    const { error } = await supabase().from('rules').insert({ pattern: pattern.trim(), category_id: categoryId, match_type: 'contains', auto: true })
    if (error) { setError(error.message); return }
    setPattern(''); setCategoryId(''); setError('')
    load()
  }

  const toggleAuto = async (r: Rule) => {
    const { error } = await supabase().from('rules').update({ auto: !r.auto }).eq('id', r.id)
    if (error) { setError(error.message); return }
    setRules(list => list.map(x => (x.id === r.id ? { ...x, auto: !r.auto } : x)))
  }

  const remove = async (r: Rule) => {
    if (!window.confirm(`Excluir a regra "${r.pattern}"?`)) return
    const { error } = await supabase().from('rules').delete().eq('id', r.id)
    if (error) { setError(error.message); return }
    setRules(list => list.filter(x => x.id !== r.id))
  }

  return (
    <div>
      <h1>Regras de categorização</h1>
      <p className="subtitle">Toda vez que a descrição do lançamento contiver o padrão, a categoria é aplicada automaticamente na conciliação.</p>

      {error && <div className="alert critical">{error}</div>}

      <div className="card">
        <h2>Nova regra</h2>
        <div className="row">
          <label className="field"><span>Se a descrição contém…</span>
            <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="ex.: MASTER IMOBILIARIA" style={{ width: 240 }} />
          </label>
          <label className="field"><span>…categorizar como</span>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">— escolher —</option>
              {groupOptions(cats)}
            </select>
          </label>
          <button className="primary" onClick={add} style={{ alignSelf: 'flex-end', marginBottom: 10 }}>Criar regra</button>
        </div>
      </div>

      <div className="card">
        <h2>Testar uma descrição</h2>
        <input style={{ width: '100%' }} value={test} onChange={e => setTest(e.target.value)}
          placeholder="cole uma descrição do extrato para ver qual regra pega, ex.: PIX ENVIADO MASTER IMOBILIARIA LTDA" />
        {test && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Normalizada: <b>{testNormalized}</b> — {testMatches.size > 0 ? `${testMatches.size} regra(s) aplicável(is), destacada(s) abaixo.` : 'nenhuma regra corresponde.'}
          </p>
        )}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Padrão</th><th>Categoria</th><th>Automática</th><th className="num">Usos</th><th></th></tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={testMatches.has(r.id) ? { outline: '2px solid var(--accent)' } : undefined}>
                <td className="mono">{r.pattern}</td>
                <td>{catById.get(r.category_id)?.name ?? '?'} <span className="muted">({catById.get(r.category_id)?.grp})</span></td>
                <td>
                  <button className="ghost" onClick={() => toggleAuto(r)} title="Alternar entre aplicar automaticamente ou apenas sugerir">
                    {r.auto ? '✅ aplica sozinha' : '💡 só sugere'}
                  </button>
                </td>
                <td className="num">{r.hits}</td>
                <td><button className="ghost" onClick={() => remove(r)}>🗑</button></td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma regra ainda — elas são criadas automaticamente quando você aceita sugestões na Conciliação.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
