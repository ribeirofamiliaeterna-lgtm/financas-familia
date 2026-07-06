import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Credenciais do Supabase: primeiro tenta variáveis de ambiente do build
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — usadas no deploy do GitHub),
 * depois localStorage (configurável na tela inicial do app).
 */
const LS_URL = 'sb_url'
const LS_KEY = 'sb_anon_key'

export function getConfig(): { url: string; key: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string) || localStorage.getItem(LS_URL) || ''
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || localStorage.getItem(LS_KEY) || ''
  if (!url || !key) return null
  return { url, key }
}

export function saveConfig(url: string, key: string) {
  localStorage.setItem(LS_URL, url.trim())
  localStorage.setItem(LS_KEY, key.trim())
}

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client
  const cfg = getConfig()
  if (!cfg) throw new Error('Supabase não configurado')
  client = createClient(cfg.url, cfg.key)
  return client
}

export const isConfigured = () => getConfig() !== null
