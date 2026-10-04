-- Obična igra: vreme ulaska u partiju koja je još u toku.
-- Partija u toku ne spušta uspešnost dok ne prođe 7 dana od ulaska.
ALTER TABLE public.normal_stats ADD COLUMN IF NOT EXISTS pending_started_at timestamptz;
NOTIFY pgrst, 'reload schema';
