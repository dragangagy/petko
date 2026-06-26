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

Then set these values in `app.js`:

```js
const SUPABASE_CONFIG = {
  url: "YOUR_SUPABASE_PROJECT_URL",
  anonKey: "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  table: "petko_scores"
};
```

Without these values the app uses local results only.
