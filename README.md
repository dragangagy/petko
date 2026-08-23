# Petko

Mobile-first Serbian Cyrillic word game (`rs.glab.petko`). Own GitHub repo and own Supabase.

**Version 1.4** (store code / build **5**). Store packaging: see `STORE.md` and `release/`.

Cross-device continue (Classic / Competitive / Challenge): run `sql/2026-08-23-game-sessions.sql` once in Petko Supabase, then play with the same nickname or profile link code.

## GitHub Pages

Publish this folder as a static site. The app works as a PWA and can be added to a phone home screen.

Required files are already in this folder:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `logo-cut.png`
- `logo-icon.png`

## Supabase

Run `supabase-schema.sql` in the Supabase SQL editor.

For starter word explanations, run `word-meanings-seed.sql` after the schema.

Then set these values in `app.js`:

```js
const SUPABASE_CONFIG = {
  url: "https://kfpyrajlxrucmrlhyvgr.supabase.co",
  anonKey: "YOUR_SB_PUBLISHABLE_KEY",
  table: "scores",
  playersTable: "players"
};
```

Without these values the app uses local results only.

`players` keeps one row per nickname. `scores` stays as the result history, so old scores are not deleted when a player has multiple played days.

`scores.score` stores the daily score. The seasonal leaderboard is calculated in the app:

```text
final = average_daily_score + min(played_days, 20) * 0.5 + min(streak, 10)
```
