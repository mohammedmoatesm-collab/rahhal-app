-- RAHHAL database starter (PostgreSQL / Supabase)
-- Apply only after creating a Supabase project and reviewing access policies.
create extension if not exists pgcrypto;

do $$ begin
  create type public.staff_role as enum ('super_admin', 'manager');
exception when duplicate_object then null; end $$;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'manager',
  created_at timestamptz not null default now()
);

create table if not exists public.lines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  university text not null,
  supervisor_name text,
  supervisor_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.line_days (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  go_time time not null,
  return_time time,
  active boolean not null default true
);

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  name text not null,
  arrival_time time,
  sort_order integer not null default 0,
  visible_to_students boolean not null default true
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('RH-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,10))),
  student_name text not null,
  student_phone text not null,
  university text not null,
  line_id uuid not null references public.lines(id),
  pickup_point_id uuid not null references public.pickup_points(id),
  trip_date date not null,
  go_time time not null,
  return_time time,
  status text not null default 'booked' check (status in ('booked','cancelled')),
  cancellation_token_hash text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists bookings_trip_date_line_idx on public.bookings(trip_date, line_id);
create index if not exists bookings_status_idx on public.bookings(status);

alter table public.staff_profiles enable row level security;
alter table public.lines enable row level security;
alter table public.line_days enable row level security;
alter table public.pickup_points enable row level security;
alter table public.bookings enable row level security;

-- Helper: manager/super-admin access is granted only to authenticated staff profiles.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff_profiles p where p.user_id = auth.uid()) $$;
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff_profiles p where p.user_id = auth.uid() and p.role = 'super_admin') $$;

-- Staff can read all lines and trip setup. Anonymous students may read active public route data.
drop policy if exists lines_public_read on public.lines;
create policy lines_public_read on public.lines for select using (active = true or public.is_staff());
drop policy if exists line_days_public_read on public.line_days;
create policy line_days_public_read on public.line_days for select using (active = true or public.is_staff());
drop policy if exists pickup_points_public_read on public.pickup_points;
create policy pickup_points_public_read on public.pickup_points for select using (visible_to_students = true or public.is_staff());

-- Only super-admin can modify route setup and staff roles.
drop policy if exists lines_admin_write on public.lines;
create policy lines_admin_write on public.lines for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists line_days_admin_write on public.line_days;
create policy line_days_admin_write on public.line_days for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists pickup_points_admin_write on public.pickup_points;
create policy pickup_points_admin_write on public.pickup_points for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists profiles_staff_read on public.staff_profiles;
create policy profiles_staff_read on public.staff_profiles for select to authenticated using (public.is_staff());
drop policy if exists profiles_admin_write on public.staff_profiles;
create policy profiles_admin_write on public.staff_profiles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Managers can read all bookings, but neither managers nor the public can update/delete them directly.
drop policy if exists bookings_staff_read on public.bookings;
create policy bookings_staff_read on public.bookings for select to authenticated using (public.is_staff());

-- IMPORTANT: booking creation and cancellation should go through the RPC functions
-- in live-functions.sql. No anonymous direct INSERT/UPDATE/DELETE policy is granted.
