# PRIX data branch

Machine-written data only: `data/snapshots/<date>.json` (daily, hashed), `data/snapshots/index.json`
(manifest the app reads), and `data/history/` (archival custody, cursor-paged NEAR Intents flow pages).
Written by the scheduled workflows on `main`. Vercel never deploys this branch (vercel.json ignoreCommand).
