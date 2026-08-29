-- Word meaning editor: per-player permission on players.can_edit_words (default false).

alter table public.players
add column if not exists can_edit_words boolean not null default false;

create or replace function public.player_can_edit_words(
  p_nickname text,
  p_device_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.can_edit_words = true
      and (
        lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')))
        or (
          btrim(coalesce(p_device_id, '')) <> ''
          and p.device_id = btrim(p_device_id)
        )
      )
  );
$$;

create or replace function public.update_word_meaning(
  p_word text,
  p_meaning text,
  p_nickname text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_word text := btrim(coalesce(p_word, ''));
  clean_meaning text := btrim(coalesce(p_meaning, ''));
begin
  if clean_word = '' or clean_meaning = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;

  if not public.player_can_edit_words(p_nickname, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.words
  set meaning = clean_meaning,
      updated_at = now()
  where word = clean_word
    and active = true;

  if not found then
    insert into public.words (word, meaning, active, updated_at)
    values (clean_word, clean_meaning, true, now())
    on conflict (word) do update
    set meaning = excluded.meaning,
        updated_at = now(),
        active = true;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.player_can_edit_words(text, text) to anon;
grant execute on function public.update_word_meaning(text, text, text, text) to anon;

-- PostgREST caches the schema; reload so new RPC endpoints are exposed:
-- NOTIFY pgrst, 'reload schema';
