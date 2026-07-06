import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const LINKS = [
  ['/', 'Dashboard'],
  ['/conciliacao', 'Conciliação'],
  ['/transacoes', 'Transações'],
  ['/orcamento', 'Orçamento'],
  ['/dividas', 'Dívidas'],
  ['/regras', 'Regras'],
  ['/relatorios', 'Relatórios'],
  ['/config', 'Configurações'],
] as const

export default function Layout({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">💰 Finanças da Família</div>
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            {label}
          </NavLink>
        ))}
        <div className="spacer" />
        <div style={{ padding: '8px 12px' }}>
          <div className="muted" style={{ marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          <button className="ghost" onClick={() => supabase().auth.signOut()}>Sair</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
