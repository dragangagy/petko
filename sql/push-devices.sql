create table if not exists public.push_devices (
  token text primary key,
  platform text not null check (platform in ('android', 'ios')),
  nickname text,
  device_id text,
  updated_at timestamptz not null default now()
);

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_insert" on public.push_devices;
create policy "push_devices_insert"
on public.push_devices
for insert
to anon
with check (true);

drop policy if exists "push_devices_update" on public.push_devices;
create policy "push_devices_update"
on public.push_devices
for update
to anon
using (true)
with check (true);
