# Petko

Mobile-first Serbian Cyrillic word game.

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
  table: "scores"
};
```

Without these values the app uses local results only.

`scores.score` stores the daily score. The seasonal leaderboard is calculated in the app:

```text
final = average_daily_score + min(played_days, 20) * 0.5 + min(streak, 10)
```
