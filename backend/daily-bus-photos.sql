-- RAHHAL daily bus photos: one image per line and trip date.
-- Run this file in Supabase SQL Editor after schema.sql.

create table if not exists public.daily_bus_photos (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  trip_date date not null,
  image_url text not null,
  storage_path text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint daily_bus_photos_line_date_unique unique (line_id, trip_date)
);

alter table public.daily_bus_photos enable row level security;

drop policy if exists daily_bus_photos_public_read on public.daily_bus_photos;
create policy daily_bus_photos_public_read
  on public.daily_bus_photos for select
  to anon, authenticated
  using (true);

drop policy if exists daily_bus_photos_staff_write on public.daily_bus_photos;
create policy daily_bus_photos_staff_write
  on public.daily_bus_photos for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Public bucket so students can view the selected bus photo without accounts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bus-photos', 'bus-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = true, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists bus_photos_public_read on storage.objects;
create policy bus_photos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'bus-photos');

drop policy if exists bus_photos_staff_insert on storage.objects;
create policy bus_photos_staff_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'bus-photos' and public.is_staff());

drop policy if exists bus_photos_staff_update on storage.objects;
create policy bus_photos_staff_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'bus-photos' and public.is_staff())
  with check (bucket_id = 'bus-photos' and public.is_staff());

drop policy if exists bus_photos_staff_delete on storage.objects;
create policy bus_photos_staff_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bus-photos' and public.is_staff());
