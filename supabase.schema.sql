-- Users table (auth handled manually / custom JWT for now)
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null default 'user',
  plan text not null default 'free',
  export_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Resumes table
create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  title text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists resumes_user_id_idx on resumes(user_id);

-- Payments table
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  amount numeric default 0,
  method text default 'dana',
  proof_url text,
  status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists payments_user_id_idx on payments(user_id);

-- Simple trigger to bump updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

create trigger trg_users_updated before update on app_users
for each row execute function set_updated_at();
create trigger trg_resumes_updated before update on resumes
for each row execute function set_updated_at();
create trigger trg_payments_updated before update on payments
for each row execute function set_updated_at();
