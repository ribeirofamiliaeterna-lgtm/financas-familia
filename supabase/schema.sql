-- ============================================================
-- FINANÇAS DA FAMÍLIA — Schema Supabase
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Ele cria todas as tabelas, índices e políticas de segurança (RLS).
-- As categorias padrão são criadas pelo app no primeiro login.
-- ============================================================

-- CONTAS (banco, cartão, dinheiro, reserva)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'corrente', -- corrente | poupanca | reserva | cartao | dinheiro
  balance numeric not null default 0,    -- saldo informado manualmente (usado p/ reserva de emergência)
  created_at timestamptz not null default now()
);

-- CATEGORIAS
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  grp text not null default 'Outros',    -- grupo: Moradia, Transporte, Assinaturas...
  kind text not null default 'despesa',  -- despesa | receita
  fixed boolean not null default false,  -- custo fixo (usado no indicador de custo fixo/renda)
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- REGRAS DE CATEGORIZAÇÃO (o "cérebro" da conciliação)
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null,                 -- texto a procurar na descrição normalizada
  match_type text not null default 'contains', -- contains | exact | regex
  category_id uuid not null references public.categories(id) on delete cascade,
  auto boolean not null default true,    -- true = categoriza sozinho; false = apenas sugere
  priority int not null default 0,       -- maior vence em caso de conflito
  hits int not null default 0,           -- quantas vezes a regra já foi aplicada
  created_at timestamptz not null default now()
);

-- IMPORTAÇÕES (cada extrato enviado)
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  filename text,
  count int not null default 0,
  created_at timestamptz not null default now()
);

-- TRANSAÇÕES (receitas positivas, despesas negativas)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  date date not null,
  description text not null,
  normalized text not null,              -- descrição normalizada p/ matching
  amount numeric not null,               -- negativo = despesa, positivo = receita
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'pendente', -- pendente | confirmada
  source text not null default 'import',   -- import | manual
  import_id uuid references public.imports(id) on delete set null,
  hash text not null,                    -- dedupe: hash(conta+data+valor+descrição)
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, hash)
);
create index if not exists idx_tx_user_date on public.transactions (user_id, date desc);
create index if not exists idx_tx_user_cat on public.transactions (user_id, category_id);

-- ORÇAMENTOS (orçado por categoria/mês — o "forecast")
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,                   -- sempre dia 1 do mês
  amount numeric not null default 0,
  unique (user_id, category_id, month)
);

-- DÍVIDAS (cartões, financiamentos, FIES...)
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'cartao',   -- cartao | financiamento | emprestimo | outro
  balance numeric not null default 0,    -- saldo devedor atual
  monthly_rate numeric not null default 0, -- juros % ao mês (ex.: 12.5 no rotativo)
  min_payment numeric not null default 0,  -- pagamento mínimo/parcela mensal
  due_day int,                           -- dia do vencimento
  created_at timestamptz not null default now()
);

-- COMPROMISSOS (parcelamentos de cartão e despesas recorrentes)
create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'recorrente',   -- parcelamento | recorrente
  category_id uuid references public.categories(id) on delete set null,
  monthly_amount numeric not null default 0,
  start_month date not null,                 -- sempre dia 1
  installments_count int,                    -- só parcelamento
  end_month date,                            -- calculado no app: start + (installments-1) p/ parcelamento; nulo = recorrente sem fim
  late boolean not null default false,       -- "parcelamento atrasado"
  active boolean not null default true,      -- permite pausar recorrente sem apagar
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_commitments_user_month on public.commitments (user_id, start_month);

-- ============================================================
-- SEGURANÇA (RLS): cada usuário só vê e altera os próprios dados
-- ============================================================
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.rules        enable row level security;
alter table public.imports      enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;
alter table public.debts        enable row level security;
alter table public.commitments  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','rules','imports','transactions','budgets','debts','commitments']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
