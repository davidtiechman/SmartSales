-- Atomic sale creation used by POST /sales.
-- PostgreSQL runs the whole function in a single transaction:
-- success commits both inserts; any exception rolls back both inserts.

create or replace function public.create_sale_and_transaction(
  p_sales_table text,
  p_transactions_table text,
  p_agent_name text,
  p_user_id int,
  p_product_id int,
  p_variant_id int,
  p_quantity int,
  p_client_name text,
  p_payment_method text,
  p_transaction_type text,
  p_transaction_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_category text;
  v_product_name text;
  v_size text;
  v_user_id int;
  v_sale_id bigint;
  v_description text;
  v_sale_started timestamptz;
  v_transaction_started timestamptz;
  v_started timestamptz := clock_timestamp();
  v_sale_insert_ms numeric;
  v_transaction_insert_ms numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  if p_transaction_amount is null or p_transaction_amount < 0 then
    raise exception 'Transaction amount must be non-negative';
  end if;

  select p.category, p.product_name, pv.size
    into v_category, v_product_name, v_size
  from public.product_variants pv
  join public.product_names p on p.product_id = pv.product_id
  where pv.variant_id = p_variant_id
    and pv.product_id = p_product_id
  limit 1;

  if v_product_name is null then
    raise exception 'Product size not found: product_id=%, variant_id=%', p_product_id, p_variant_id;
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
      user_id,
      product_id,
      variant_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',
    p_sales_table
  )
  using
    v_product_name,
    v_size,
    p_quantity,
    v_category,
    p_agent_name,
    p_client_name,
    p_payment_method,
    v_user_id,
    p_product_id,
    p_variant_id
  into v_sale_id;
  v_sale_insert_ms := extract(epoch from (clock_timestamp() - v_sale_started)) * 1000;

  v_description := format('Auto from sale: %s x%s (%s)', v_product_name, p_quantity, p_payment_method);

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
      'product_name', v_product_name,
      'size', v_size,
      'quantity', p_quantity,
      'category', v_category,
      'agent', p_agent_name,
      'client_name', p_client_name,
      'payment_method', p_payment_method,
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
