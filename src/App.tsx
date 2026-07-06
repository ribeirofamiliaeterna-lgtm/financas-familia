import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ImportPage from './pages/Import'
import Transactions from './pages/Transactions'
import RulesPage from './pages/Rules'
import BudgetPage from './pages/Budget'
import DebtsPage from './pages/Debts'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'

export default function App() {
  const [configured, setConfigured] = useState(isConfigured())
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    const sb = supabase()
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [configured])

  if (loading) return <div className="login-wrap"><p className="muted">Carregando…</p></div>

  if (!configured || !session) {
    return <Login configured={configured} onConfigured={() => setConfigured(true)} />
  }

  return (
    <Layout email={session.user.email ?? ''}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/conciliacao" element={<ImportPage />} />
        <Route path="/transacoes" element={<Transactions />} />
        <Route path="/regras" element={<RulesPage />} />
        <Route path="/orcamento" element={<BudgetPage />} />
        <Route path="/dividas" element={<DebtsPage />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/config" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
