# Padel Courtside — touchscreen kiosk

A portrait (1080 × 1920) touchscreen for the Bloomberg × Greenhouse Sports
Charity Padel Tournament: live court scores, group standings, results, the
knockout draw, teams and a court map. Plain HTML/CSS/JS — no build step.
Modelled on the BNEF Summit London kiosk.

## Screens

- **Welcome loop** — after `idleSeconds` untouched (default 90s). Rotates live
  matches, champions, group leaders and what's coming up. Any tap opens Home.
- **Home** — what's on each of the five courts, up next, champions banner.
- **Standings** — one table per court group; Q marks the 8 quarter-finalists
  (5 group winners + 3 best runners-up).
- **Results** — every played match, filter by court or knockout.
- **Knockout** — the draw (QF → SF → 3rd place / Final) and qualifying table.
- **Teams** — every pair; search by team or player name with the on-screen keyboard (also "Find your team" on Home); tap a team for its record and matches.
- **Map** — court layout; tap a court for what's on.

## Where the scores come from

The **master scoresheet is the Market Partner admin** for the `tournament_2026`
event (client `bloomberg_padel`). Scorers update each match's *score* entity —
home points, away points, match status — and the kiosk picks it up.

| Kiosk needs | Platform source |
|---|---|
| Matches, times, courts | `agendas` — one agenda per court + `knockout_stages` |
| Teams in each match | `content-relationships` — Session → `home_team` / `away_team` |
| Scores + status | `content/entities` — `Custom:score` |
| Team names + players | `registrations?categoryType=Speaker` (category `team`) |

Status words are matched in `config.js` (`statusWords`): e.g. "Completed" →
final, "Live"/"In progress" → live, anything else → scheduled.

The kiosk works out standings, qualifiers, seeding and knockout progression
itself; teams set on the platform for a knockout match always win.

## Live vs snapshot

1. The kiosk calls the bbgevent.app APIs directly every 60s. **This only works
   once the kiosk's address (e.g. `https://market-partner-sites.github.io`) is
   on the API's CORS allow-list** — ask the platform team.
2. If that fails it reads `data/*.json`, which the GitHub Action refreshes every
   ~5–15 minutes. Good enough as a fallback, not for live scores. A yellow bar
   on screen says when it is showing saved scores.

## Running on the totem

```
google-chrome --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 \
  "https://<your-pages-url>/?cursor=hide"
```

Other URL options: `?view=standings|results|knockout|teams|map`, `?attract=1`,
`?snapshot=1` (skip the live API, for testing).

Serve it over http(s) — GitHub Pages, or `python3 -m http.server` locally —
not from disk; browsers block `fetch()` of local JSON files.
