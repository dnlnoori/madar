# MADAR changelog

## 1.0.1 — 2026-11-09

- Removed automatic per-cell error checking and all mistake counting triggered by temporary sun/moon selections.
- Removed the automatic-error toggle from the game tools and settings.
- Added a manual final-answer check that appears only when the board is full; it gives general feedback without highlighting cells.
- Moved smart hints into an inline card below the puzzle board so the board remains visible.
- Highlighted the forced cell while its location is being explained.
- Count a hint when the player reveals the first clue, not when they merely open and dismiss the hint panel.
- Clarified star scoring: completion always earns at least one star; zero hints earns three stars, one hint earns two, and two or more hints earns one.
- Migrated existing saved star records to the updated scoring rules while removing obsolete mistake counters.
