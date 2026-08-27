-- Add ledger metadata columns to agent_transactions.
-- Safe to run more than once.

alter table if exists public.agent_transactions
  add column if not exists source_type text,
  add column if not exists source_id bigint,
  add column if not exists sale_id bigint,
  add column if not exists created_by text,
  add column if not exists note text;

update public.agent_transactions
set source_type = case
  when description ilike 'Auto from sale:%' then 'sale'
  when description ilike 'Auto reconcile %' then 'reconcile'
  else 'manual'
end
where source_type is null;

alter table public.agent_transactions
  alter column source_type set default 'manual';

create index if not exists idx_agent_transactions_agent_name_created_at
  on public.agent_transactions (agent_name, created_at desc);

create index if not exists idx_agent_transactions_source_type
  on public.agent_transactions (source_type);

create index if not exists idx_agent_transactions_sale_id
  on public.agent_transactions (sale_id);
