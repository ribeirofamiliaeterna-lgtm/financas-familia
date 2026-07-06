export interface Account {
  id: string
  name: string
  type: 'corrente' | 'poupanca' | 'reserva' | 'cartao' | 'dinheiro'
  balance: number
}

export interface Category {
  id: string
  name: string
  grp: string
  kind: 'despesa' | 'receita'
  fixed: boolean
}

export interface Rule {
  id: string
  pattern: string
  match_type: 'contains' | 'exact' | 'regex'
  category_id: string
  auto: boolean
  priority: number
  hits: number
}

export interface Transaction {
  id: string
  account_id: string | null
  date: string // yyyy-mm-dd
  description: string
  normalized: string
  amount: number // negativo = despesa
  category_id: string | null
  status: 'pendente' | 'confirmada'
  source: 'import' | 'manual'
  hash: string
  notes?: string | null
}

export interface Budget {
  id: string
  category_id: string
  month: string // yyyy-mm-01
  amount: number
}

export interface Debt {
  id: string
  name: string
  kind: 'cartao' | 'financiamento' | 'emprestimo' | 'outro'
  balance: number
  monthly_rate: number // % ao mês
  min_payment: number
  due_day: number | null
}

/** Linha parseada do extrato, antes de virar Transaction */
export interface ParsedRow {
  date: string
  description: string
  amount: number
}

/** Linha em revisão na conciliação */
export interface ReviewRow extends ParsedRow {
  normalized: string
  hash: string
  duplicate: boolean
  categoryId: string | null
  matchedBy: 'regra' | 'historico' | null
  ruleId: string | null
  confidence: number // 0..1
  createRule: boolean
  include: boolean
}
