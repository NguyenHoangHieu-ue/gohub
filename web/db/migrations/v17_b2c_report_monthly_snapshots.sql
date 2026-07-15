-- B2C report monthly snapshots
-- One row per month. Dashboard reads this table so opening the report does not call
-- Admin GoHub, Chatwoot, or the analytics warehouse live for every viewer.

create table if not exists public.b2c_report_monthly_snapshots (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  payload jsonb not null default '{}'::jsonb,
  source_status jsonb not null default '{}'::jsonb,
  refresh_status text not null default 'success',
  error_message text,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_b2c_report_monthly_snapshots_refreshed_at
  on public.b2c_report_monthly_snapshots (refreshed_at desc);

create or replace function public.set_b2c_report_monthly_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_b2c_report_monthly_snapshots_updated_at
  on public.b2c_report_monthly_snapshots;

create trigger trg_b2c_report_monthly_snapshots_updated_at
before update on public.b2c_report_monthly_snapshots
for each row execute function public.set_b2c_report_monthly_snapshots_updated_at();
