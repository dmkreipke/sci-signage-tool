# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

The SCI Signage Tool is a Node.js/Express server that drives multiple physical display screens at the Science Center of Iowa. An admin portal lets staff upload group schedules (CSV) and configure public-facing event displays. All display pages are vanilla-JS browser pages that poll the server's API.

Production runs on a Raspberry Pi at `ssh signageserver@192.168.39.73`, managed by PM2. The Pi's browsers are managed by **Yodeck**, which handles kiosk mode, screen assignment, and remote display control. Deploy path: push to GitHub → SSH to Pi → `git pull` → `pm2 restart all`.

## Commands

```bash
npm start          # run the server (port 3000)
npm run qr <url>   # regenerate the facility-map QR code image
```

No build step, no test suite, no linter. Changes are live immediately after server restart.

## Display Inventory

Each HTML file maps to a specific physical screen:

| File | Physical screen |
|---|---|
| `public/display/star-theater-public.html` | Star Theater lobby — public visitors (1080×1920 portrait kiosk) |
| `public/display/star-theater-group.html` | Star Theater lobby — school group variant |
| `public/display/sci-live.html` | SCI Live theater lobby |
| `public/display/group-schedules.html` | Staff/group area — horizontally scrolling group cards |
| `public/display/public-signage.html` | General public-facing display |

All display pages support a **preview mode** via `?preview` query param, and a **time override** set from the admin portal (stored in `localStorage` under `sciTimeOverride`, applied via `time-override.js`). Display JS must use `window.__nowDate()` instead of `new Date()` for any clock/time logic.

## Architecture

### Data flow — group schedules

```
CSV upload → src/csvParser.js → routes/api.js → src/scheduleStore.js (data/schedule.json)
                                                → src/scheduleListsStore.js (data/schedule-lists.json)

Display poll: GET /api/schedule/:display → src/displayFilter.js → display page JS
```

`displayFilter.js` is the key transformation layer. The raw schedule is a flat list of rows (one row = one group's one program). `filterAndMerge()` reshapes this differently per display:
- `star-theater` / `sci-live`: groups rows by time slot, merges school groups attending the same show into one card
- `group-schedules`: pivots to group-per-card, listing each group's programs and lunch across the day

### Data flow — public signage

```
sciowa.org calendar (scraped every 60s) → src/publicScheduleScraper.js → data/public-signage-cache.json
                                                                        ↓
Admin manual events + hidden event list → src/publicSignageStore.js → data/public-signage.json
                                                                        ↓
                                                GET /api/public-signage/today → public-signage.html
```

The scraper uses HTTP caching headers (etag/Last-Modified) to avoid re-downloading unchanged pages. If the site is unreachable, the cache file keeps the display alive.

Event identity for the hidden-events feature uses "signatures" — a `|`-joined string of `startTime|endTime|title|location` — because scraped events have no stable ID.

### Key source files

- `src/csvParser.js` — strips Excel BOM, maps flexible column headers to internal field names, validates times and locations, returns `{ rows, warnings }`
- `src/displayFilter.js` — pure data transformation, no I/O; called per-request
- `src/scheduleListsStore.js` — maintains autocomplete lists; some entries (e.g. "Star Theater Planetarium") are flagged permanent and survive a wipe
- `src/publicSignageStore.js` — owns config (ticker, QR URL, closing time), manual events, and the hidden-event list

### Display JS conventions

- `kiosk-lock.js` — load first on any unattended display; blocks right-click, text selection, certain keyboard shortcuts
- `time-override.js` — load before the display's main script; exposes `window.__nowDate()` and fires `timeoverridechange` events
- Polling is done with `setInterval` + `fetch`; no WebSockets
- No frontend framework or build tool — all vanilla JS, CSS custom properties, no transpilation

## CSS / Design Conventions (display pages)

The Star Theater and SCI Live displays share a visual language:

- Fonts: `Duke Fill` / `Duke` (brand display), `Barlow Condensed` (labels/UI), `Meta` / `MetaBR` (body)
- Color tokens: `--navy-900` through `--navy-600`, `--gold` (`#f5b400`), `--gold-2` (`#ffc940`), `--cream`, `--muted`
- Stage is always a fixed 1080×1920 div scaled to fit the viewport (`transform-origin: center center`)
- Animated elements use `will-change: transform` or `will-change: opacity`

The group-schedules display has its own separate stylesheet and no shared tokens with the theater pages.

## Constraints

- No new npm dependencies without good reason — the Pi has limited resources and `npm install` must run there
- Flat JSON files are the persistence layer; do not introduce a database
- No authentication on the admin portal by design (LAN-only deployment)
