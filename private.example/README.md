# Local binder (not in git)

Copy this folder to `private/` at the repo root. `.gitignore` already excludes `private/` — never commit it, never copy it into `src/` or `public/`, never paste it into Guide copy.

Production `npm run build` does not bundle this directory. `npm run dev` can load `private/watchlist.json` as `/watchlist.local.json` (see `vite.config.ts`).

## Suggested layout

```text
private/
  README.md           # your notes (this machine only)
  watchlist.json      # rights to pin in local Explore
  briefing.md         # optional: internal GIS notes (not an in-app report)
  docs/               # PDFs, scans — keep off GitHub
```

## watchlist.json

Same shape as [`watchlist.example.json`](../watchlist.example.json):

```json
{
  "rights": [{ "wr": "34-00600" }, { "wr": "34-00606" }]
}
```

Those two numbers are published SRBA subcase identifiers (Alder Creek). Replace or extend with whatever you are tracking. The live map still treats them as ordinary IDWR rights — no special styling.

## Do not put here into the product

- Case captions or family names in Guide, README, or commits
- An “injury” or “misappropriation” report inside the web app
- Original place-of-use scans unless you are only using them locally
