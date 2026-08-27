alter table if exists public.sales
add column if not exists payment_source text not null default 'manual';

alter table if exists public.sales_test
add column if not exists payment_source text not null default 'manual';

drop function if exists public.create_sale_and_transaction(
  text,
  text,
  text,
  int,
  int,
  int,
  text,
  text,
  text,
  int,
  text,
  text,
  text,
  numeric
);

create or replace function public.create_sale_and_transaction(
  p_sales_table text,
  p_transactions_table text,
  p_agent_name text,
  p_user_id int,
  p_product_id int,
  p_variant_id int,
  p_category text,
  p_product_name text,
  p_size text,
  p_quantity int,
  p_client_name text,
  p_payment_method text,
  p_payment_source text,
  p_transaction_type text,
  p_transaction_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id int;
  v_sale_id bigint;
  v_payment_source text := coalesce(nullif(trim(p_payment_source), ''), 'manual');
  v_description text;
  v_sale_started timestamptz;
  v_transaction_started timestamptz;
  v_started timestamptz := clock_timestamp();
  v_sale_insert_ms numeric;
  v_transaction_insert_ms numeric;
begin
  if p_product_id is null or p_variant_id is null or p_category is null or p_product_name is null or p_size is null then
    raise exception 'Cached product data is missing: product_id=%, variant_id=%, category=%, product_name=%, size=%',
      p_product_id, p_variant_id, p_category, p_product_name, p_size;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  if p_transaction_amount is null or p_transaction_amount < 0 then
    raise exception 'Transaction amount must be non-negative';
  end if;

  v_user_id := p_user_id;
  if v_user_id is null then
    select id
      into v_user_id
    from public.users
    where agent_name = p_agent_name
      and is_active = true
    limit 1;
  end if;

  if v_user_id is null then
    raise exception 'Agent not found: agent_name=%', p_agent_name;
  end if;

  v_sale_started := clock_timestamp();
  execute format(
    'insert into %I (
      product_name,
      size,
      quantity,
      category,
      agent,
      client_name,
      payment_method,
      payment_source,
      user_id,
      product_id,
      variant_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',
    p_sales_table
  )
  using
    p_product_name,
    p_size,
    p_quantity,
    p_category,
    p_agent_name,
    p_client_name,
    p_payment_method,
    v_payment_source,
    v_user_id,
    p_product_id,
    p_variant_id
  into v_sale_id;
  v_sale_insert_ms := extract(epoch from (clock_timestamp() - v_sale_started)) * 1000;

  v_description := format('Auto from sale: %s x%s (%s)', p_product_name, p_quantity, p_payment_method);

  v_transaction_started := clock_timestamp();
  execute format(
    'insert into %I (
      agent_name,
      transaction_type,
      amount,
      description,
      source_type,
      source_id,
      sale_id,
      created_by,
      note
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    p_transactions_table
  )
  using
    p_agent_name,
    p_transaction_type,
    p_transaction_amount,
    v_description,
    'sale',
    v_sale_id,
    v_sale_id,
    'system',
    'Auto transaction from sale creation';
  v_transaction_insert_ms := extract(epoch from (clock_timestamp() - v_transaction_started)) * 1000;

  return jsonb_build_object(
    'status', 'created',
    'sale', jsonb_build_object(
      'id', v_sale_id,
      'product_name', p_product_name,
      'size', p_size,
      'quantity', p_quantity,
      'category', p_category,
      'agent', p_agent_name,
      'client_name', p_client_name,
      'payment_method', p_payment_method,
      'payment_source', v_payment_source,
      'user_id', v_user_id,
      'product_id', p_product_id,
      'variant_id', p_variant_id
    ),
    'transaction', jsonb_build_object(
      'agent_name', p_agent_name,
      'transaction_type', p_transaction_type,
      'amount', p_transaction_amount,
      'description', v_description,
      'source_type', 'sale',
      'source_id', v_sale_id,
      'sale_id', v_sale_id,
      'created_by', 'system',
      'note', 'Auto transaction from sale creation'
    ),
    'timings', jsonb_build_object(
      'sale_insert_ms', round(v_sale_insert_ms, 2),
      'transaction_insert_ms', round(v_transaction_insert_ms, 2),
      'total_transaction_ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000, 2)
    )
  );
end;
$$;
