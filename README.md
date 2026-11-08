# MADAR | مدار

A Persian-first, RTL cosmic logic puzzle game inspired by Tango-style binary grid puzzles. The project is built with React, TypeScript, Vite, Framer Motion, and Lucide icons.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Included

- 100 predefined, playable levels across 4×4, 6×6, and 8×8 boards.
- Every included puzzle was programmatically checked to have exactly one solution.
- Rules: equal numbers of suns and moons per row/column, no three identical symbols in a line, unique rows and columns, and same/different edge constraints.
- A backtracking solver with constraint pruning, forced-move hints, and unique-solution validation for imported levels.
- Persian RTL interface, cosmic dark theme, animated intro, interactive onboarding tutorial.
- Level map, chapter progression, locked levels, stars, XP, daily streak, streak calendar, hints, undo/redo, timer, statistics, and settings.
- Sound effects, optional ambient synthesized background tone, and optional haptic feedback on supported devices.
- LocalStorage persistence for player progress, custom levels, settings, and an in-progress puzzle (resume after refresh).
- JSON import/export level management panel. New levels are assigned sequential IDs starting at 101.
- PWA manifest, app icon, and a small service worker for app-shell caching.

## Level data

Initial levels are stored in `src/data/levels.json`. The level schema is defined in `src/game/types.ts`.

To add more levels at runtime:
1. Open Settings → Level Management.
2. Paste a JSON object or array of level objects.
3. Choose “Validate and add”.
4. The game checks the grid shape, cell values, adjacent constraints, solution validity, and that the puzzle has exactly one solution before accepting it.

To edit or back up the full level set, use the JSON export action in the level manager.

## Data and deployment notes

- Player progress and custom levels are stored locally in the browser. No account or backend is required.
- The admin panel is a local authoring utility, not a secured multi-user CMS. Add authentication and a database before exposing it publicly.
- The project uses original interface styling and puzzle content; it does not copy Tango branding or assets.
- Google Fonts is used for Vazirmatn; a sans-serif fallback is included if the font cannot load.
