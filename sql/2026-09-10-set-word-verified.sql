-- Toggle word verification star without editing meaning.
-- Editors only (players.can_edit_words = true).

create or replace function public.set_word_verified(
  p_word text,
  p_verified boolean,
  p_nickname text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  clean_word text := btrim(coalesce(p_word, ''));
begin
  if clean_word = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;

  if not public.player_can_edit_words(p_nickname, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.words
  set verified = coalesce(p_verified, false),
      updated_at = now()
  where word = clean_word
    and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'verified', coalesce(p_verified, false));
end;
$fn$;

grant execute on function public.set_word_verified(text, boolean, text, text) to anon;

NOTIFY pgrst, 'reload schema';
