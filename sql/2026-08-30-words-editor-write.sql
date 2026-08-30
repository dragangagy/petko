-- Allow word editors to save meanings from the web app (PATCH/POST on words).
-- Permission is enforced in the app via players.can_edit_words before calling write APIs.

drop policy if exists "words_insert" on public.words;
create policy "words_insert"
on public.words
for insert
to anon
with check (true);

drop policy if exists "words_update" on public.words;
create policy "words_update"
on public.words
for update
to anon
using (true)
with check (true);
