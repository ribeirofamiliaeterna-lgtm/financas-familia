import { useState } from 'react'
import { saveConfig, supabase } from '../lib/supabase'

/**
 * Tela inicial: configura a conexão com o Supabase (uma vez por dispositivo)
 * e faz login/cadastro por e-mail e senha.
 */
export default function Login({ configured, onConfigured }: { configured: boolean; onConfigured: () => void }) {
  if (!configured) return <SetupForm onDone={onConfigured} />
  return <AuthForm />
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!/^https:\/\/.+\.supabase\.co/.test(url.trim())) {
      setError('URL inválida — use a "Project URL" do painel do Supabase (https://xxxx.supabase.co)')
      return
    }
    if (key.trim().length < 30) {
      setError('Chave inválida — use a "anon public key" do painel do Supabase')
      return
    }
    saveConfig(url, key)
    onDone()
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Conectar ao Supabase</h1>
        <p className="subtitle">Cole a URL do projeto e a chave anônima (Settings → API no painel do Supabase). Fica salvo neste dispositivo.</p>
        <label className="field"><span>Project URL</span>
          <input style={{ width: '100%' }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
        </label>
        <label className="field"><span>anon public key</span>
          <input style={{ width: '100%' }} value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi..." />
        </label>
        {error && <p className="neg">{error}</p>}
        <button className="primary" onClick={submit}>Salvar e continuar</button>
      </div>
    </div>
  )
}

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      const sb = supabase()
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await sb.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Conta criada! Se a confirmação por e-mail estiver ativa no Supabase, verifique sua caixa de entrada.')
      }
    } catch (err: any) {
      setMsg(err.message ?? 'Erro ao autenticar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>💰 Finanças da Família</h1>
        <p className="subtitle">Controle de gastos, conciliação de extratos e plano de quitação de dívidas.</p>
        <div className="tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Criar conta</button>
        </div>
        <form onSubmit={submit}>
          <label className="field"><span>E-mail</span>
            <input style={{ width: '100%' }} type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="field"><span>Senha</span>
            <input style={{ width: '100%' }} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {msg && <p className="muted">{msg}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  )
}
