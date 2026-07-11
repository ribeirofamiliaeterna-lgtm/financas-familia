import { supabase } from './supabase'
import { Account, Budget, Category, Debt, Rule, Transaction } from './types'

/** Camada de acesso a dados — todas as queries do Supabase em um só lugar. */

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase().from('categories').select('*').order('grp').order('name')
  if (error) throw error
  return data as Category[]
}

export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase().from('accounts').select('*').order('name')
  if (error) throw error
  return data as Account[]
}

export async function fetchRules(): Promise<Rule[]> {
  const { data, error } = await supabase().from('rules').select('*').order('priority', { ascending: false })
  if (error) throw error
  return data as Rule[]
}

export async function fetchDebts(): Promise<Debt[]> {
  const { data, error } = await supabase().from('debts').select('*').order('monthly_rate', { ascending: false })
  if (error) throw error
  return data as Debt[]
}

export async function fetchTransactions(fromDate?: string, toDate?: string): Promise<Transaction[]> {
  let q = supabase().from('transactions').select('*').order('date', { ascending: false }).limit(5000)
  if (fromDate) q = q.gte('date', fromDate)
  if (toDate) q = q.lte('date', toDate)
  const { data, error } = await q
  if (error) throw error
  return data as Transaction[]
}

export async function fetchBudgets(month?: string): Promise<Budget[]> {
  let q = supabase().from('budgets').select('*')
  if (month) q = q.eq('month', month)
  const { data, error } = await q
  if (error) throw error
  return data as Budget[]
}

export async function createCategory(name: string, grp: string, kind: 'despesa' | 'receita', fixed: boolean) {
  const { error } = await supabase().from('categories').insert({ name, grp, kind, fixed })
  if (error) throw error
}

export async function upsertBudget(categoryId: string, month: string, amount: number) {
  const { data: userData } = await supabase().auth.getUser()
  const { error } = await supabase().from('budgets').upsert(
    { user_id: userData.user!.id, category_id: categoryId, month, amount },
    { onConflict: 'user_id,category_id,month' },
  )
  if (error) throw error
}

/**
 * Categorias padrão — espelham a estrutura do forecast da família
 * (grupos: Moradia, Alimentação, Transporte, Saúde, Educação, Assinaturas,
 * Dívidas, Telefonia, Impostos, Pessoal, Lazer, Receitas).
 * Criadas automaticamente no primeiro login.
 */
const DEFAULT_CATEGORIES: Array<[string, string, 'despesa' | 'receita', boolean]> = [
  // [nome, grupo, tipo, custo fixo]
  ['Aluguel', 'Moradia', 'despesa', true],
  ['Condomínio', 'Moradia', 'despesa', true],
  ['Luz', 'Moradia', 'despesa', true],
  ['Água', 'Moradia', 'despesa', true],
  ['Internet', 'Moradia', 'despesa', true],
  ['Manutenção da casa', 'Moradia', 'despesa', false],
  ['Supermercado', 'Alimentação', 'despesa', false],
  ['Dia a dia', 'Alimentação', 'despesa', false],
  ['Restaurantes e delivery', 'Alimentação', 'despesa', false],
  ['Parcela do carro', 'Transporte', 'despesa', true],
  ['Gasolina', 'Transporte', 'despesa', false],
  ['Seguro do carro', 'Transporte', 'despesa', true],
  ['Lavagem e manutenção', 'Transporte', 'despesa', false],
  ['Uber/99/Transporte', 'Transporte', 'despesa', false],
  ['Plano de saúde', 'Saúde', 'despesa', true],
  ['Academia', 'Saúde', 'despesa', true],
  ['Farmácia', 'Saúde', 'despesa', false],
  ['Médicos e exames', 'Saúde', 'despesa', false],
  ['Escola', 'Educação', 'despesa', true],
  ['FIES', 'Educação', 'despesa', true],
  ['Pós-graduação', 'Educação', 'despesa', true],
  ['Cursos e livros', 'Educação', 'despesa', false],
  ['Streaming e apps', 'Assinaturas', 'despesa', true],
  ['iCloud/Google/Nuvem', 'Assinaturas', 'despesa', true],
  ['Fatura de cartão', 'Dívidas e Cartões', 'despesa', false],
  ['Parcelamentos', 'Dívidas e Cartões', 'despesa', false],
  ['Parcelamentos atrasados', 'Dívidas e Cartões', 'despesa', false],
  ['Financiamento imóvel', 'Dívidas e Cartões', 'despesa', true],
  ['Empréstimos', 'Dívidas e Cartões', 'despesa', false],
  ['Juros e tarifas bancárias', 'Dívidas e Cartões', 'despesa', false],
  ['Celular', 'Telefonia', 'despesa', true],
  ['IPVA', 'Impostos e Taxas', 'despesa', false],
  ['IPTU', 'Impostos e Taxas', 'despesa', false],
  ['Outros impostos', 'Impostos e Taxas', 'despesa', false],
  ['Salão e cuidados pessoais', 'Pessoal', 'despesa', false],
  ['Vestuário', 'Pessoal', 'despesa', false],
  ['Presentes', 'Pessoal', 'despesa', false],
  ['Lazer e passeios', 'Lazer', 'despesa', false],
  ['Viagem', 'Lazer', 'despesa', false],
  ['Pró-labore', 'Receitas', 'receita', false],
  ['Divisão de lucro', 'Receitas', 'receita', false],
  ['Aluguel recebido', 'Receitas', 'receita', false],
  ['Outras receitas', 'Receitas', 'receita', false],
  ['Transferência entre contas', 'Transferências', 'despesa', false],
  ['Outros', 'Outros', 'despesa', false],
]

/** Cria categorias padrão se o usuário ainda não tem nenhuma. Retorna a lista final. */
export async function ensureDefaultCategories(): Promise<Category[]> {
  const existing = await fetchCategories()
  if (existing.length > 0) return existing
  const rows = DEFAULT_CATEGORIES.map(([name, grp, kind, fixed]) => ({ name, grp, kind, fixed }))
  const { error } = await supabase().from('categories').insert(rows)
  if (error) throw error
  return fetchCategories()
}
