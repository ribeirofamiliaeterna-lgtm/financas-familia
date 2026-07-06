import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureDefaultCategories, fetchAccounts, fetchRules } from '../lib/data'
import { parseStatement } from '../lib/parsers'
import { normalizeDescription, suggestPattern, txHash } from '../lib/normalize'
import { matchRule, suggestFromHistory } from '../lib/rules'
import { Account, Category, ReviewRow, Rule } from '../lib/types'
import { brl, dateBR } from '../lib/format'

/**
 * CONCILIAÇÃO: cole ou envie o extrato do mês (OFX ou CSV).
 * O sistema reconhece padrões ("MASTER IMOBILIARIA" → Aluguel), sugere a
 * categoria de cada lançamento e, ao aceitar, pode criar uma regra para
 * categorizar automaticamente da próxima vez.
 */
export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [history, setHistory] = useState<{ normalized: string; category_id: string | null }[]>([])
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set())

  const [accountId, setAccountId] = useState('')
  const [pasted, setPasted] = useState('')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetchAccounts(), ensureDefaultCategories(), fetchRules(),
      supabase().from('transactions').select('normalized, category_id, hash').limit(5000),
    ]).then(([a, c, r, tx]) => {
      setAccounts(a)
      if (a.length > 0) setAccountId(a[0].id)
      setCats(c)
      setRules(r)
      const txs = (tx.data ?? []) as { normalized: string; category_id: string | null; hash: string }[]
      setHistory(txs)
      setExistingHashes(new Set(txs.map(t => t.hash)))
    }).catch(e => setError(e.message))
  }, [])

  const catById = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])

  const analyze = (name: string, content: string) => {
    setError(''); setDone('')
    const parsed = parseStatement(name, content)
    if (parsed.length === 0) {
      setError('Não consegui reconhecer lançamentos nesse conteúdo. Envie um arquivo OFX/CSV do banco ou cole as linhas do extrato (data; descrição; valor).')
      return
    }
    const review: ReviewRow[] = parsed.map(p => {
      const normalized = normalizeDescription(p.description)
      const hash = txHash(accountId || null, p.date, p.amount, normalized)
      const rule = matchRule(rules, normalized)
      let categoryId: string | null = null
      let matchedBy: ReviewRow['matchedBy'] = null
      let confidence = 0
      if (rule) {
        categoryId = rule.category_id
        matchedBy = 'regra'
        confidence = 1
      } else {
        const sug = suggestFromHistory(history, normalized)
        if (sug) {
          categoryId = sug.categoryId
          matchedBy = 'historico'
          confidence = sug.confidence
        }
      }
      const duplicate = existingHashes.has(hash)
      return {
        ...p, normalized, hash, duplicate,
        categoryId, matchedBy, ruleId: rule?.id ?? null, confidence,
        createRule: matchedBy === 'historico', // sugerido pelo histórico → oferecer automatizar
        include: !duplicate,
      }
    })
    setFilename(name)
    setRows(review)
  }

  const onFile = async (f: File) => {
    const buf = await f.arrayBuffer()
    // extratos brasileiros costumam vir em latin-1
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('iso-8859-1').decode(buf)
    analyze(f.name, text)
  }

  const setRow = (i: number, patch: Partial<ReviewRow>) => {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  const confirm = async () => {
    setBusy(true); setError('')
    try {
      const sb = supabase()
      const { data: userData } = await sb.auth.getUser()
      const uid = userData.user!.id
      const included = rows.filter(r => r.include && !r.duplicate)

      const { data: imp, error: impErr } = await sb.from('imports')
        .insert({ filename: filename || 'colado', account_id: accountId || null, count: included.length })
        .select().single()
      if (impErr) throw impErr

      const txRows = included.map(r => ({
        user_id: uid,
        account_id: accountId || null,
        date: r.date,
        description: r.description,
        normalized: r.normalized,
        amount: r.amount,
        category_id: r.categoryId,
        status: 'confirmada',
        source: 'import',
        import_id: imp.id,
        hash: r.hash,
      }))
      const { error: txErr } = await sb.from('transactions').upsert(txRows, { onConflict: 'user_id,hash', ignoreDuplicates: true })
      if (txErr) throw txErr

      // cria regras novas para os aceitos com "automatizar" marcado
      const newRules = new Map<string, string>() // pattern -> category
      for (const r of included) {
        if (r.createRule && r.categoryId && !r.ruleId) {
          newRules.set(suggestPattern(r.normalized), r.categoryId)
        }
      }
      if (newRules.size > 0) {
        const ruleRows = [...newRules.entries()].map(([pattern, category_id]) => ({
          user_id: uid, pattern, category_id, match_type: 'contains', auto: true,
        }))
        const { error: rErr } = await sb.from('rules').insert(ruleRows)
        if (rErr) throw rErr
      }

      // incrementa hits das regras usadas
      const usedRules = new Map<string, number>()
      for (const r of included) if (r.ruleId) usedRules.set(r.ruleId, (usedRules.get(r.ruleId) ?? 0) + 1)
      for (const [id, n] of usedRules) {
        const rule = rules.find(x => x.id === id)
        if (rule) await sb.from('rules').update({ hits: rule.hits + n }).eq('id', id)
      }

      setDone(`${included.length} lançamentos importados${newRules.size ? ` e ${newRules.size} regras novas criadas` : ''}. Da próxima vez, esses padrões serão categorizados automaticamente.`)
      setRows([]); setPasted('')
      setRules(await fetchRules())
    } catch (e: any) {
      setError(e.message ?? 'Erro ao importar')
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    const inc = rows.filter(r => r.include && !r.duplicate)
    return {
      total: rows.length,
      dups: rows.filter(r => r.duplicate).length,
      auto: rows.filter(r => r.matchedBy === 'regra').length,
      suggested: rows.filter(r => r.matchedBy === 'historico').length,
      uncategorized: inc.filter(r => !r.categoryId).length,
      included: inc.length,
    }
  }, [rows])

  return (
    <div>
      <h1>Conciliação bancária</h1>
      <p className="subtitle">Envie o extrato do mês (OFX ou CSV do banco) ou cole as linhas. O sistema reconhece os padrões e aprende com você.</p>

      {accounts.length === 0 && (
        <div className="alert">Crie primeiro uma conta em <b>Configurações</b> (ex.: "Santander", "Nubank") para vincular o extrato.</div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="field" style={{ margin: 0 }}><span>Conta</span>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}><span>Arquivo do extrato (.ofx ou .csv)</span>
            <input ref={fileRef} type="file" accept=".ofx,.csv,.txt" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
        <label className="field"><span>…ou cole o extrato aqui (data; descrição; valor — uma linha por lançamento)</span>
          <textarea style={{ width: '100%', minHeight: 90 }} value={pasted} onChange={e => setPasted(e.target.value)}
            placeholder={'05/06/2026; PIX ENVIADO MASTER IMOBILIARIA; -2500,00\n06/06/2026; COMPRA SUPERMERCADO ASSAI; -387,45'} />
        </label>
        <button className="primary" disabled={!pasted.trim()} onClick={() => analyze('colado.csv', pasted)}>Analisar texto colado</button>
      </div>

      {error && <div className="alert critical">{error}</div>}
      {done && <div className="alert good">{done}</div>}

      {rows.length > 0 && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Revisão — {stats.included} de {stats.total} serão importados</h2>
            <div className="row">
              <span className="badge rule">{stats.auto} por regra</span>
              <span className="badge hist">{stats.suggested} sugeridos</span>
              {stats.dups > 0 && <span className="badge dup">{stats.dups} duplicados (ignorados)</span>}
              {stats.uncategorized > 0 && <span className="badge">{stats.uncategorized} sem categoria</span>}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th><th>Data</th><th>Descrição</th><th className="num">Valor</th>
                  <th>Categoria</th><th>Origem</th><th title="Categorizar automaticamente da próxima vez">Automatizar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.hash + i} style={r.duplicate ? { opacity: 0.45 } : undefined}>
                    <td><input type="checkbox" checked={r.include && !r.duplicate} disabled={r.duplicate}
                      onChange={e => setRow(i, { include: e.target.checked })} /></td>
                    <td className="mono">{dateBR(r.date)}</td>
                    <td title={r.normalized}>{r.description}</td>
                    <td className={`num ${r.amount < 0 ? 'neg' : 'pos'}`}>{brl(r.amount)}</td>
                    <td>
                      <select value={r.categoryId ?? ''} onChange={e => setRow(i, {
                        categoryId: e.target.value || null,
                        createRule: e.target.value ? true : r.createRule,
                      })}>
                        <option value="">— escolher —</option>
                        {groupOptions(cats, r.amount)}
                      </select>
                    </td>
                    <td>
                      {r.duplicate ? <span className="badge dup">duplicado</span>
                        : r.matchedBy === 'regra' ? <span className="badge rule">regra</span>
                        : r.matchedBy === 'historico' ? <span className="badge hist">sugestão {(r.confidence * 100).toFixed(0)}%</span>
                        : <span className="badge">novo</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!r.ruleId && r.categoryId ? (
                        <input type="checkbox" checked={r.createRule} onChange={e => setRow(i, { createRule: e.target.checked })} />
                      ) : r.ruleId ? '✓' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" disabled={busy || stats.included === 0} onClick={confirm}>
              {busy ? 'Importando…' : `Confirmar importação (${stats.included})`}
            </button>
            <button className="ghost" onClick={() => setRows([])}>Cancelar</button>
            {stats.uncategorized > 0 && <span className="muted">Lançamentos sem categoria entram como "a classificar" — você pode ajustar depois em Transações.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export function groupOptions(cats: Category[], amount?: number) {
  const wanted = amount === undefined ? null : amount >= 0 ? 'receita' : 'despesa'
  const groups = new Map<string, Category[]>()
  for (const c of cats) {
    // para receitas mostra receitas primeiro, mas permite tudo
    const list = groups.get(c.grp) ?? []
    list.push(c)
    groups.set(c.grp, list)
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (wanted === 'receita') {
      if (a === 'Receitas') return -1
      if (b === 'Receitas') return 1
    }
    return a.localeCompare(b)
  })
  return sorted.map(([grp, list]) => (
    <optgroup key={grp} label={grp}>
      {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </optgroup>
  ))
}
