-- ============================================================================
-- Admin: activity log reader, client health, Stripe mirror, legacy GHL (run in the DASHBOARD project, after 015)
--   - the activity log: filter by date, who and action, with pages
--   - client health: how the system is performing for one client, and what is wrong
--   - billing now mirrors Stripe (Stripe takes the payments; this only reads them). The manual invoice list is removed.
--   - the old GoHighLevel location id can still be set, for the rare client who needs it
-- Every admin function checks the caller is an admin signed in with their authenticator code.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. activity log
-- Works with whatever columns the admin log has. Returns one page, the total, and who/what to offer as filters.
create or replace function public.admin_activity_list(
  p_account_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor uuid default null,
  p_action text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
  v_actor text;
  v_detail text;
  v_where text;
  v_total bigint;
  v_rows jsonb;
  v_actors jsonb := '[]'::jsonb;
  v_actions jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_like text;
begin
  perform private.require_admin_mfa();

  select array_agg(column_name::text) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'admin_audit_log';
  if v_cols is null or not ('created_at' = any (v_cols)) or not ('action' = any (v_cols)) or not ('account_id' = any (v_cols)) then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb, 'actors', '[]'::jsonb, 'actions', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset);
  end if;

  v_actor := case
               when 'admin_user_id' = any (v_cols) then 'admin_user_id'
               when 'admin_id' = any (v_cols) then 'admin_id'
               when 'actor_id' = any (v_cols) then 'actor_id'
               when 'user_id' = any (v_cols) then 'user_id'
             end;
  v_detail := case when 'detail' = any (v_cols) then 'l.detail::text' else 'null::text' end;

  v_where := format(' where l.account_id = %L', p_account_id);
  if p_from is not null then v_where := v_where || format(' and l.created_at >= %L', p_from); end if;
  if p_to is not null then v_where := v_where || format(' and l.created_at < %L', p_to); end if;
  if p_actor is not null and v_actor is not null then
    v_where := v_where || format(' and l.%I::text = %L', v_actor, p_actor::text);
  end if;
  if p_action is not null and btrim(p_action) <> '' then v_where := v_where || format(' and l.action::text = %L', btrim(p_action)); end if;
  if p_search is not null and btrim(p_search) <> '' then
    v_like := '%' || btrim(p_search) || '%';
    v_where := v_where || format(' and (l.action::text ilike %L or %s ilike %L)', v_like, v_detail, v_like);
  end if;

  execute 'select count(*) from public.admin_audit_log l' || v_where into v_total;

  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'created_at', x.created_at, 'action', x.action, 'detail', x.detail,
             'actor_id', x.actor_id, 'actor_email', u.email) order by x.created_at desc), '[]'::jsonb)
      from (select (to_jsonb(l) ->> 'id') as id, l.created_at, l.action::text as action, %s as detail, %s as actor_id
              from public.admin_audit_log l %s
             order by l.created_at desc limit %s offset %s) x
      left join auth.users u on u.id::text = x.actor_id
  $q$, v_detail, case when v_actor is null then 'null::text' else format('l.%I::text', v_actor) end, v_where, v_limit, v_offset)
  into v_rows;

  if v_actor is not null then
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('id', a.actor_id, 'email', u.email) order by u.email), '[]'::jsonb)
        from (select distinct l.%I::text as actor_id from public.admin_audit_log l
               where l.account_id = %L and l.%I is not null) a
        left join auth.users u on u.id::text = a.actor_id
    $q$, v_actor, p_account_id, v_actor) into v_actors;
  end if;

  execute format($q$
    select coalesce(jsonb_agg(a.action order by a.action), '[]'::jsonb)
      from (select distinct l.action::text as action from public.admin_audit_log l where l.account_id = %L) a
  $q$, p_account_id) into v_actions;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'actors', v_actors, 'actions', v_actions, 'limit', v_limit, 'offset', v_offset);
end;
$$;

-- ---------------------------------------------------------------- 2. client health
create or replace function public.admin_client_health(p_account_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_since timestamptz;
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  v_since := now() - make_interval(days => v_days);

  return jsonb_build_object(
    'window_days', v_days,
    'messages', (
      select jsonb_build_object(
               'inbound', count(*) filter (where m.direction = 'inbound'),
               'outbound', count(*) filter (where m.direction = 'outbound'),
               'delivered', count(*) filter (where m.direction = 'outbound' and m.delivery_status = 'delivered'),
               'failed', count(*) filter (where m.direction = 'outbound' and m.delivery_status = 'failed'),
               'queued', count(*) filter (where m.direction = 'outbound' and m.delivery_status = 'queued'))
        from public.messages m where m.account_id = p_account_id and m.sent_at >= v_since),
    'conversations', jsonb_build_object(
      'started', (select count(*) from public.leads l where l.account_id = p_account_id and l.created_at >= v_since),
      'booked', (select count(distinct e.lead_id) from public.lead_events e
                  where e.account_id = p_account_id and e.event_type = 'booked' and e.created_at >= v_since),
      'handed_off', (select count(*) from public.lead_state s
                      where s.account_id = p_account_id and s.stage = 'handed_off' and s.updated_at >= v_since),
      'opted_out', (select count(*) from public.account_opt_outs o where o.account_id = p_account_id and o.opted_out_at >= v_since)),
    'response', (
      select jsonb_build_object(
               'avg_seconds', coalesce(round(avg(l.response_seconds))::integer, 0),
               'slowest_seconds', coalesce(max(l.response_seconds), 0),
               'measured', count(*))
        from public.leads l
       where l.account_id = p_account_id and l.created_at >= v_since and coalesce(l.response_seconds, 0) > 0),
    'ai', (
      select jsonb_build_object(
               'calls', count(*),
               'errors', count(*) filter (where c.verdict = 'error'),
               'fallbacks', count(*) filter (where c.verdict = 'fallback'),
               'blocked', count(*) filter (where c.verdict = 'blocked'),
               'avg_latency_ms', coalesce(round(avg(c.latency_ms))::integer, 0),
               'input_tokens', coalesce(sum(c.input_tokens), 0),
               'output_tokens', coalesce(sum(c.output_tokens), 0))
        from public.ai_calls c where c.account_id = p_account_id and c.created_at >= v_since),
    'engine', jsonb_build_object(
      'pending', (select count(*) from public.inbox i where i.account_id = p_account_id and i.status in ('pending', 'processing')),
      'failed', (select count(*) from public.inbox i where i.account_id = p_account_id and i.status = 'failed' and i.received_at >= v_since),
      'last_inbound_at', (select max(i.received_at) from public.inbox i where i.account_id = p_account_id and i.event_type = 'sms_inbound'),
      'last_outbound_at', (select max(m.sent_at) from public.messages m where m.account_id = p_account_id and m.direction = 'outbound')),
    'alerts', (
      select jsonb_build_object(
               'sent', count(*) filter (where a.status = 'sent'),
               'failed', count(*) filter (where a.status = 'failed'),
               'pending', count(*) filter (where a.status in ('pending', 'sending')))
        from public.owner_alerts a where a.account_id = p_account_id and a.created_at >= v_since),
    'calendar', (
      select jsonb_build_object(
               'status', coalesce(c.status, 'not_connected'),
               'last_synced_at', c.last_synced_at,
               'failed_writes', (select count(*) from public.calendar_outbox o where o.account_id = p_account_id and o.status = 'failed'))
        from (select 1) one left join public.calendar_connections c on c.account_id = p_account_id),
    'weather', (
      select jsonb_build_object('last_error', w.last_error, 'fetched_at', w.fetched_at, 'storm_mode', coalesce(w.storm_mode, false))
        from (select 1) one left join public.account_weather w on w.account_id = p_account_id),
    'recent_errors', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.at desc)
        from (
          select * from (
            select i.received_at as at, 'An incoming text could not be processed' as kind, left(coalesce(i.last_error, ''), 200) as detail
              from public.inbox i where i.account_id = p_account_id and i.status = 'failed' and i.received_at >= v_since
            union all
            select a.created_at, 'A text to the owner failed', left(coalesce(a.last_error, ''), 200)
              from public.owner_alerts a where a.account_id = p_account_id and a.status = 'failed' and a.created_at >= v_since
            union all
            select m.sent_at, 'A text was not delivered', left(coalesce(to_jsonb(m) ->> 'error_text', ''), 200)
              from public.messages m where m.account_id = p_account_id and m.direction = 'outbound' and m.delivery_status = 'failed' and m.sent_at >= v_since
            union all
            select ev.created_at, 'Engine error', left(coalesce(ev.detail, ''), 200)
              from public.lead_events ev where ev.account_id = p_account_id and ev.event_type = 'engine_error' and ev.created_at >= v_since
          ) u order by at desc limit 15
        ) e), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- 3. Stripe takes the payments; we mirror what it says
alter table public.account_billing
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_status text,
  add column if not exists stripe_price_label text,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists stripe_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_payment_method text,
  add column if not exists stripe_synced_at timestamptz;
create unique index if not exists account_billing_stripe_customer_idx on public.account_billing (stripe_customer_id) where stripe_customer_id is not null;

create table if not exists public.stripe_invoices (
  id text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  number text,
  status text not null,
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  currency text not null default 'usd',
  hosted_invoice_url text,
  issued_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists stripe_invoices_account_idx on public.stripe_invoices (account_id, issued_at desc);

-- every Stripe event we have handled, so a repeat delivery does nothing twice
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  account_id uuid,
  note text,
  received_at timestamptz not null default now()
);

alter table public.stripe_invoices enable row level security;
alter table public.stripe_events enable row level security;
revoke all on table public.stripe_invoices, public.stripe_events from anon, authenticated;
grant all on table public.stripe_invoices, public.stripe_events to service_role;

create or replace function private.engine_billing_json(p_account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.account_billing%rowtype;
  v_exists boolean;
begin
  select * into b from public.account_billing where account_id = p_account;
  v_exists := found;
  if not v_exists then
    b.plan := 'Not linked'; b.monthly_price_cents := 0; b.status := 'trial'; b.stripe_cancel_at_period_end := false;
  end if;

  return jsonb_build_object(
    'exists', v_exists,
    'linked', (b.stripe_customer_id is not null),
    'plan', b.plan,
    'monthly_price_cents', b.monthly_price_cents,
    'status', b.status,
    'go_live_at', b.go_live_at,
    'guarantee_override', b.guarantee_override,
    'notes', b.notes,
    'stripe', jsonb_build_object(
      'customer_id', b.stripe_customer_id,
      'subscription_id', b.stripe_subscription_id,
      'status', b.stripe_status,
      'price_label', b.stripe_price_label,
      'current_period_end', b.stripe_current_period_end,
      'cancel_at_period_end', coalesce(b.stripe_cancel_at_period_end, false),
      'payment_method', b.stripe_payment_method,
      'synced_at', b.stripe_synced_at),
    'paid_cents', coalesce((select sum(i.amount_paid_cents) from public.stripe_invoices i where i.account_id = p_account), 0),
    'open_cents', coalesce((select sum(i.amount_due_cents) from public.stripe_invoices i where i.account_id = p_account and i.status = 'open'), 0),
    'invoices', coalesce((select jsonb_agg(to_jsonb(x) order by x.issued_at desc nulls last)
                            from (select id, number, status, amount_due_cents, amount_paid_cents, currency, hosted_invoice_url, issued_at, paid_at
                                    from public.stripe_invoices where account_id = p_account
                                   order by issued_at desc nulls last limit 24) x), '[]'::jsonb),
    'guarantee', private.engine_guarantee(p_account, b.go_live_at, b.guarantee_override)
  );
end;
$$;

-- what an admin may still type in by hand: when the 30 days started, a guarantee decision, a note
create or replace function public.admin_billing_save(p_account_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text;
begin
  perform private.require_admin_mfa();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch_must_be_object';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;

  insert into public.account_billing (account_id) values (p_account_id) on conflict (account_id) do nothing;

  update public.account_billing set
    go_live_at = case when (p_patch -> 'go_live_at') is not null then nullif(p_patch ->> 'go_live_at', '')::timestamptz else go_live_at end,
    guarantee_override = case when (p_patch -> 'guarantee_override') is not null then nullif(p_patch ->> 'guarantee_override', '') else guarantee_override end,
    notes = case when (p_patch -> 'notes') is not null then nullif(btrim(p_patch ->> 'notes'), '') else notes end
  where account_id = p_account_id;

  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(p_patch) k;
  perform private.engine_log_admin_action(p_account_id, 'billing_changed', left('Billing changed: ' || coalesce(v_keys, ''), 200));
  return private.engine_billing_json(p_account_id);
end;
$$;

-- connect this client to their Stripe customer. Pass null to unlink.
create or replace function public.admin_billing_link_stripe(p_account_id uuid, p_customer_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(coalesce(p_customer_id, '')), '');
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  if v_id is not null and v_id !~ '^cus_[A-Za-z0-9]{6,60}$' then
    raise exception 'bad_stripe_customer';
  end if;

  insert into public.account_billing (account_id, stripe_customer_id) values (p_account_id, v_id)
  on conflict (account_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = case when excluded.stripe_customer_id is distinct from public.account_billing.stripe_customer_id then null else public.account_billing.stripe_subscription_id end;

  perform private.engine_log_admin_action(p_account_id, 'stripe_linked',
    case when v_id is null then 'Unlinked the Stripe customer' else 'Linked Stripe customer ' || v_id end);
  return private.engine_billing_json(p_account_id);
end;
$$;

-- the next three are called only by the Stripe webhook (service role). Each is safe to repeat.
create or replace function public.engine_stripe_record_subscription(p_event_id text, p_type text, p_customer_id text, p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid;
  v_status text;
  v_item jsonb := p_data -> 'items' -> 'data' -> 0;
  v_unit integer;
  v_interval text;
  v_end bigint;
begin
  select account_id into v_acct from public.account_billing where stripe_customer_id = p_customer_id;

  insert into public.stripe_events (id, type, account_id, note) values (p_event_id, p_type, v_acct, case when v_acct is null then 'unknown customer' end)
  on conflict (id) do nothing;
  if not found or v_acct is null then
    return false;
  end if;

  v_status := case p_data ->> 'status'
                when 'active' then 'active' when 'trialing' then 'trial'
                when 'past_due' then 'past_due' when 'unpaid' then 'past_due'
                when 'canceled' then 'canceled' when 'paused' then 'paused'
                else 'trial' end;
  v_unit := coalesce((v_item -> 'price' ->> 'unit_amount')::integer, 0);
  v_interval := coalesce(v_item -> 'price' -> 'recurring' ->> 'interval', 'month');
  v_end := coalesce((p_data ->> 'current_period_end')::bigint, (v_item ->> 'current_period_end')::bigint);

  update public.account_billing set
    stripe_subscription_id = p_data ->> 'id',
    stripe_status = p_data ->> 'status',
    status = v_status,
    stripe_price_label = coalesce(nullif(v_item -> 'price' ->> 'nickname', ''), stripe_price_label),
    plan = coalesce(nullif(v_item -> 'price' ->> 'nickname', ''), plan),
    monthly_price_cents = case when v_unit > 0 then (case when v_interval = 'year' then round(v_unit / 12.0)::integer else v_unit end) else monthly_price_cents end,
    stripe_current_period_end = case when v_end is not null then to_timestamp(v_end) else stripe_current_period_end end,
    next_invoice_on = case when v_end is not null and v_status in ('active', 'trial', 'past_due') then to_timestamp(v_end)::date else next_invoice_on end,
    stripe_cancel_at_period_end = coalesce((p_data ->> 'cancel_at_period_end')::boolean, false),
    stripe_synced_at = now()
  where account_id = v_acct;
  return true;
end;
$$;

create or replace function public.engine_stripe_record_invoice(p_event_id text, p_type text, p_customer_id text, p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid;
begin
  select account_id into v_acct from public.account_billing where stripe_customer_id = p_customer_id;

  insert into public.stripe_events (id, type, account_id, note) values (p_event_id, p_type, v_acct, case when v_acct is null then 'unknown customer' end)
  on conflict (id) do nothing;
  if not found or v_acct is null then
    return false;
  end if;

  insert into public.stripe_invoices (id, account_id, number, status, amount_due_cents, amount_paid_cents, currency, hosted_invoice_url, issued_at, period_start, period_end, paid_at, updated_at)
  values (p_data ->> 'id', v_acct, p_data ->> 'number', coalesce(p_data ->> 'status', 'open'),
          coalesce((p_data ->> 'amount_due')::integer, 0), coalesce((p_data ->> 'amount_paid')::integer, 0),
          coalesce(p_data ->> 'currency', 'usd'), p_data ->> 'hosted_invoice_url',
          to_timestamp((p_data ->> 'created')::bigint), to_timestamp((p_data ->> 'period_start')::bigint), to_timestamp((p_data ->> 'period_end')::bigint),
          to_timestamp((p_data -> 'status_transitions' ->> 'paid_at')::bigint), now())
  on conflict (id) do update
    set number = excluded.number, status = excluded.status, amount_due_cents = excluded.amount_due_cents,
        amount_paid_cents = excluded.amount_paid_cents, hosted_invoice_url = excluded.hosted_invoice_url,
        paid_at = excluded.paid_at, updated_at = now();

  -- a failed payment shows as past due until Stripe says otherwise
  if p_type = 'invoice.payment_failed' then
    update public.account_billing set status = 'past_due', stripe_synced_at = now() where account_id = v_acct and status <> 'canceled';
  else
    update public.account_billing set stripe_synced_at = now() where account_id = v_acct;
  end if;
  return true;
end;
$$;

create or replace function public.engine_stripe_record_payment_method(p_event_id text, p_type text, p_customer_id text, p_label text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid;
begin
  select account_id into v_acct from public.account_billing where stripe_customer_id = p_customer_id;
  insert into public.stripe_events (id, type, account_id, note) values (p_event_id, p_type, v_acct, case when v_acct is null then 'unknown customer' end)
  on conflict (id) do nothing;
  if not found or v_acct is null then
    return false;
  end if;
  update public.account_billing set stripe_payment_method = left(p_label, 80), stripe_synced_at = now() where account_id = v_acct;
  return true;
end;
$$;

-- the manual invoice list is gone: Stripe is the source of truth
drop function if exists public.admin_invoice_add(uuid, text, integer, date, text, text);
drop function if exists public.admin_invoice_set_status(uuid, text, date);
drop table if exists public.account_invoices;

-- ---------------------------------------------------------------- 4. legacy GoHighLevel
create or replace function public.admin_set_legacy_ghl(p_account_id uuid, p_location_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(coalesce(p_location_id, '')), '');
begin
  perform private.require_admin_mfa();
  if v_id is not null and (char_length(v_id) > 100 or v_id !~ '^[A-Za-z0-9_-]+$') then
    raise exception 'bad_ghl_location';
  end if;
  update public.accounts set ghl_location_id = v_id where id = p_account_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.engine_log_admin_action(p_account_id, 'legacy_ghl_changed',
    case when v_id is null then 'Cleared the legacy GHL location' else 'Set the legacy GHL location' end);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- 5. permissions
revoke all on function public.admin_activity_list(uuid, timestamptz, timestamptz, uuid, text, text, integer, integer) from public, anon;
revoke all on function public.admin_client_health(uuid, integer) from public, anon;
revoke all on function public.admin_billing_save(uuid, jsonb) from public, anon;
revoke all on function public.admin_billing_link_stripe(uuid, text) from public, anon;
revoke all on function public.admin_set_legacy_ghl(uuid, text) from public, anon;
grant execute on function public.admin_activity_list(uuid, timestamptz, timestamptz, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.admin_client_health(uuid, integer) to authenticated;
grant execute on function public.admin_billing_save(uuid, jsonb) to authenticated;
grant execute on function public.admin_billing_link_stripe(uuid, text) to authenticated;
grant execute on function public.admin_set_legacy_ghl(uuid, text) to authenticated;

revoke all on function public.engine_stripe_record_subscription(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.engine_stripe_record_invoice(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.engine_stripe_record_payment_method(text, text, text, text) from public, anon, authenticated;
grant execute on function public.engine_stripe_record_subscription(text, text, text, jsonb) to service_role;
grant execute on function public.engine_stripe_record_invoice(text, text, text, jsonb) to service_role;
grant execute on function public.engine_stripe_record_payment_method(text, text, text, text) to service_role;

commit;
