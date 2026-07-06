# 💰 Finanças da Família

Sistema pessoal de gestão financeira na nuvem: conciliação de extratos bancários com
categorização inteligente (que aprende com você), orçamento orçado × realizado,
plano de quitação de dívidas e indicadores de saúde financeira.

**Stack:** React + Vite + TypeScript · Supabase (banco + autenticação) · GitHub Pages (hospedagem gratuita)

## Funcionalidades

- **Conciliação bancária** — envie o extrato do mês (OFX ou CSV de qualquer banco, ou cole o texto).
  O sistema reconhece padrões ("MASTER IMOBILIARIA" → Aluguel), sugere a categoria de cada
  lançamento e, ao aceitar, cria uma regra para categorizar sozinho da próxima vez.
  Lançamentos duplicados são detectados e ignorados automaticamente.
- **Regras de categorização** — gerencie, teste e ajuste os padrões aprendidos.
- **Orçamento (forecast)** — defina o orçado por categoria/mês e acompanhe o realizado,
  com alerta de estouro. Copie o orçamento de um mês para o outro com um clique.
- **Dívidas** — cadastre cartões, FIES, financiamentos com juros mensais e simule as
  estratégias **Avalanche** (maior juros primeiro, economiza mais) e **Snowball**
  (menor saldo primeiro), com data projetada de quitação e total de juros.
- **Indicadores** — taxa de poupança, comprometimento de renda com dívidas (DTI),
  custo fixo/renda, reserva de emergência em meses, gasto médio diário com projeção,
  custo anual de assinaturas.
- **Relatórios** — evolução mensal por grupo, auditoria de recorrências (candidatos a corte),
  top estabelecimentos, exportação CSV para Excel.

## Configuração (uma vez só)

### 1. Supabase (banco de dados — grátis)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel, abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute.
3. Em **Authentication → Providers → Email**, deixe Email habilitado.
   (Opcional: desative "Confirm email" para entrar sem confirmação.)
4. Anote em **Settings → API**: a **Project URL** e a **anon public key**.

### 2. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173 — na primeira tela, cole a Project URL e a anon key,
crie sua conta de usuário e pronto.

### 3. Publicar no GitHub Pages (acessar de qualquer lugar)

1. Crie um repositório no GitHub e envie o código:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/financas-familia.git
   git push -u origin main
   ```
2. No repositório: **Settings → Pages → Source: GitHub Actions**.
3. (Opcional, recomendado) Em **Settings → Secrets and variables → Actions**, crie:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key

   Com os secrets, o app já sai publicado conectado ao seu Supabase.
   Sem eles, o app pede a URL/chave na primeira tela (fica salvo no dispositivo).
4. Todo push na branch `main` publica automaticamente.

> A anon key é pública por design — a segurança vem do Row Level Security (RLS)
> configurado no schema: cada usuário só enxerga os próprios dados.

## Fluxo de uso mensal

1. Baixe o extrato do mês no app do banco (OFX de preferência) e importe em **Conciliação**.
2. Revise as sugestões — o que você aceitar vira regra e no mês seguinte é automático.
3. Confira o **Dashboard** e o **Orçamento**: onde estourou? o que dá para cortar?
4. Consulte **Relatórios → Auditoria de recorrências** para caçar assinaturas e tarifas.
5. Registre o pagamento das dívidas e acompanhe a curva de quitação em **Dívidas**.
