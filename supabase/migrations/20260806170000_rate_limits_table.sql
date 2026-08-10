-- Table: rate_limits

-- -----------------------------------------------------------------------------
-- rate_limits
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL PRIMARY KEY,
  window_start  BIGINT NOT NULL,
  request_count BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key)
);

create index if not exists idx_rate_limits_updated_at
  on rate_limits (updated_at);

-- Function acquire_rate_limit_bucket 
create or replace function acquire_rate_limit_bucket(
  p_key text,
  p_window_start bigint,
  p_max bigint
)
returns table (allowed boolean, request_count bigint)
language plpgsql
as $$
declare
  existing record;
begin
  select *
  into existing
  from rate_limits
  where key = p_key
  for update;

  if not found then
    insert into rate_limits (key, window_start, request_count, updated_at)
    values (p_key, p_window_start, 1, now());

    return query select true, 1::bigint;
    return;
  end if;

  if existing.window_start <> p_window_start then
    update rate_limits
    set window_start = p_window_start,
        request_count = 1,
        updated_at = now()
    where key = p_key;

    return query select true, 1::bigint;
    return;
  end if;

  if existing.request_count >= p_max then
    return query select false, existing.request_count;
    return;
  end if;

  update rate_limits
  set request_count = request_count + 1,
      updated_at = now()
  where key = p_key;

  return query select true, existing.request_count + 1;
end;
$$;