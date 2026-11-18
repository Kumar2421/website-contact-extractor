-- Contact Extractor core schema.
-- Reads go through RLS (users see only their own rows). All writes go through server routes that use
-- the service-role key, so no insert/update/delete policies are granted to client roles.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles and credits
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'scale')),
  credits integer not null default 200 check (credits >= 0),
  monthly_grant integer not null default 200,
  credits_reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  default_options jsonb not null default '{}'::jsonb,
  webhook_url text,
  created_at timestamptz not null default now()
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('signup', 'monthly_grant', 'contact_site', 'ai_summary', 'refund', 'purchase', 'adjustment')),
  run_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);

-- New users get a profile and their free grant.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.credit_ledger (user_id, delta, reason, note) values (new.id, 200, 'signup', 'Free monthly credits');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- runs
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled run',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'cancelled', 'failed')),
  source text not null default 'app' check (source in ('app', 'api', 'rerun')),
  options jsonb not null default '{}'::jsonb,
  webhook_url text,
  total integer not null default 0,
  processed integer not null default 0,
  found integer not null default 0,
  empty integer not null default 0,
  failed integer not null default 0,
  charged integer not null default 0,
  max_charge integer,
  parent_run_id uuid references public.runs (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  webhook_sent_at timestamptz
);
create index runs_user_created_idx on public.runs (user_id, created_at desc);
create index runs_active_idx on public.runs (status) where status in ('queued', 'running');
create index runs_parent_idx on public.runs (parent_run_id);

create table public.run_sites (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  input text not null,
  domain text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'found', 'empty', 'failed', 'blocked', 'invalid', 'skipped')),
  status_note text,
  result jsonb,
  new_values jsonb,
  charged boolean not null default false,
  attempts integer not null default 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  unique (run_id, position)
);
create index run_sites_pending_idx on public.run_sites (run_id, position) where status in ('pending', 'processing');
create index run_sites_run_status_idx on public.run_sites (run_id, status);
create index run_sites_user_idx on public.run_sites (user_id);

-- ---------------------------------------------------------------- contact book (one row per user + domain)
create table public.contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  domain text not null,
  company_name text,
  summary text,
  industry text,
  country text,
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  whatsapp text[] not null default '{}',
  socials jsonb not null default '{}'::jsonb,
  contact_page text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_run_id uuid references public.runs (id) on delete set null,
  times_seen integer not null default 1,
  primary key (user_id, domain)
);
create index contacts_user_seen_idx on public.contacts (user_id, last_seen_at desc);
create index contacts_last_run_idx on public.contacts (last_run_id);

-- ---------------------------------------------------------------- API keys (hashed, shown once)
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id);

-- ---------------------------------------------------------------- RLS: owners read their own rows
alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.runs enable row level security;
alter table public.run_sites enable row level security;
alter table public.contacts enable row level security;
alter table public.api_keys enable row level security;

create policy "own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own ledger" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "own runs" on public.runs for select to authenticated using ((select auth.uid()) = user_id);
create policy "own run sites" on public.run_sites for select to authenticated using ((select auth.uid()) = user_id);
create policy "own contacts" on public.contacts for select to authenticated using ((select auth.uid()) = user_id);
create policy "own api keys" on public.api_keys for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.profiles, public.credit_ledger, public.runs, public.run_sites, public.contacts, public.api_keys from anon, authenticated;
revoke all on public.profiles, public.credit_ledger, public.runs, public.run_sites, public.contacts, public.api_keys from anon;
grant select on public.profiles, public.credit_ledger, public.runs, public.run_sites, public.contacts, public.api_keys to authenticated;

-- ---------------------------------------------------------------- worker functions (service role only)

-- Atomically claim up to p_limit pending sites of one run. Stale claims (worker died) are re-claimed
-- after 3 minutes; a site is given up after 3 attempts.
create function public.claim_sites(p_run uuid, p_limit integer)
returns setof public.run_sites
language sql security invoker set search_path = '' as $$
  update public.run_sites s
     set status = 'processing', claimed_at = now(), attempts = s.attempts + 1
   where s.id in (
     select id from public.run_sites
      where run_id = p_run
        and (status = 'pending' or (status = 'processing' and claimed_at < now() - interval '3 minutes'))
        and attempts < 3
      order by position
      limit p_limit
      for update skip locked
   )
  returning s.*;
$$;

-- Charge one credit for a site with a contact. Returns false (and charges nothing) when the user is out
-- of credits or the run hit its max_charge cap. Idempotent per site.
create function public.charge_site(p_site bigint)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  v_site public.run_sites;
  v_run public.runs;
begin
  select * into v_site from public.run_sites where id = p_site for update;
  if not found then return false; end if;
  if v_site.charged then return true; end if;
  select * into v_run from public.runs where id = v_site.run_id for update;
  if v_run.max_charge is not null and v_run.charged >= v_run.max_charge then return false; end if;
  update public.profiles set credits = credits - 1 where user_id = v_site.user_id and credits >= 1;
  if not found then return false; end if;
  update public.run_sites set charged = true where id = p_site;
  update public.runs set charged = charged + 1 where id = v_site.run_id;
  insert into public.credit_ledger (user_id, delta, reason, run_id) values (v_site.user_id, -1, 'contact_site', v_site.run_id);
  return true;
end;
$$;

-- Recount a run's counters from its sites and close it when nothing is left.
create function public.refresh_run(p_run uuid)
returns public.runs
language plpgsql security invoker set search_path = '' as $$
declare
  v public.runs;
begin
  update public.runs r set
    processed = c.processed, found = c.found, empty = c.empty, failed = c.failed,
    status = case
      when r.status in ('cancelled', 'failed') then r.status
      when c.open = 0 then 'completed'
      when c.processed > 0 or c.claimed > 0 then 'running'
      else r.status end,
    started_at = coalesce(r.started_at, case when c.processed > 0 or c.claimed > 0 then now() end),
    finished_at = case when r.status not in ('cancelled', 'failed') and c.open = 0 then coalesce(r.finished_at, now()) else r.finished_at end
  from (
    select
      count(*) filter (where status not in ('pending', 'processing')) as processed,
      count(*) filter (where status = 'found') as found,
      count(*) filter (where status = 'empty') as empty,
      count(*) filter (where status in ('failed', 'blocked', 'invalid')) as failed,
      count(*) filter (where status in ('pending', 'processing') and attempts < 3) as open,
      count(*) filter (where status = 'processing') as claimed
    from public.run_sites where run_id = p_run
  ) c
  where r.id = p_run
  returning r.* into v;
  return v;
end;
$$;

-- Monthly free-credit top-up, applied lazily when a profile is read.
create function public.apply_monthly_grant(p_user uuid)
returns public.profiles
language plpgsql security invoker set search_path = '' as $$
declare
  v public.profiles;
begin
  update public.profiles
     set credits = greatest(credits, monthly_grant),
         credits_reset_at = date_trunc('month', now()) + interval '1 month'
   where user_id = p_user and credits_reset_at <= now()
  returning * into v;
  if found then
    insert into public.credit_ledger (user_id, delta, reason, note) values (p_user, 0, 'monthly_grant', 'Monthly free credits topped up');
  else
    select * into v from public.profiles where user_id = p_user;
  end if;
  return v;
end;
$$;

revoke execute on function public.claim_sites(uuid, integer), public.charge_site(bigint), public.refresh_run(uuid), public.apply_monthly_grant(uuid) from public, anon, authenticated;
grant execute on function public.claim_sites(uuid, integer), public.charge_site(bigint), public.refresh_run(uuid), public.apply_monthly_grant(uuid) to service_role;
