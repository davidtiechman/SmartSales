-- Link sale-generated account transactions to their source sale.
-- Deleting a sale deletes the account transactions created from that sale.

do $$
declare
  transactions_table regclass;
begin
  transactions_table := to_regclass('public.agents_transactions');
  if transactions_table is null then
    transactions_table := to_regclass('public.agent_transactions');
  end if;

  if transactions_table is null then
    raise exception 'Neither public.agents_transactions nor public.agent_transactions exists';
  end if;

  execute format(
    'alter table %s add column if not exists sale_id bigint',
    transactions_table
  );

  if exists (
    select 1
    from pg_constraint
    where conname = 'fk_agent_transactions_sale'
      and conrelid = transactions_table
  ) then
    execute format(
      'alter table %s drop constraint fk_agent_transactions_sale',
      transactions_table
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_agent_transactions_sale'
      and conrelid = transactions_table
  ) then
    execute format(
      'alter table %s
       add constraint fk_agent_transactions_sale
       foreign key (sale_id)
       references public.sales(id)
       on delete cascade
       not valid',
      transactions_table
    );
  end if;
end $$;
