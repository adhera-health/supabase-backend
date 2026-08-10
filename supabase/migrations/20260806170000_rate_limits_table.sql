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
--
-- Note: the row is seeded via INSERT ... ON CONFLICT DO NOTHING before the
-- SELECT ... FOR UPDATE so that two concurrent first requests for a
-- brand-new key can't both take the "not found" branch and race each
-- other on the primary key insert. The increment UPDATE qualifies
-- `rate_limits.request_count` because RETURNS TABLE(..., request_count
-- bigint) implicitly declares `request_count` as a plpgsql variable in
-- this function's scope, which would otherwise make the bare column
-- reference ambiguous.
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
  insert into rate_limits (key, window_start, request_count, updated_at)
  values (p_key, p_window_start, 0, now())
  on conflict (key) do nothing;

  select *
  into existing
  from rate_limits
  where key = p_key
  for update;

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
  set request_count = rate_limits.request_count + 1,
      updated_at = now()
  where key = p_key;

  return query select true, existing.request_count + 1;
end;
$$;