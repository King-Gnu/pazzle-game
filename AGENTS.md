# Agent Guide

This repository is a static browser game (no build toolchain). Use this file as the source of truth for how to run, test, and edit the code.

## Quick Facts
- Runtime: Browser (Canvas, DOM)
- Languages: HTML, CSS, JavaScript
- Entry points: `index.html`, `main.js`, `puzzle-generator.js`, `style.css`
- Visualizer: `visualizer.html`, `visualizer.js`

## Commands (Build/Lint/Test)
There is no build system, linter, or test runner configured. Use the commands below as the canonical options.

### Run Locally
- Open directly: double-click `index.html`
- Local server (Python 3):
  - `python -m http.server 8000`
  - then open `http://localhost:8000/`
- Local server (Node):
  - `npx serve`

### Single "Test"
There are no automated tests. The closest options are manual or runtime checks:
- Manual smoke test: load `index.html` and verify puzzle generation and input flow.
- Stress test (URL query params):
  - `http://localhost:8000/?stress=1`
  - `http://localhost:8000/?stress=1&runs=1000`
  - `http://localhost:8000/?stress=1&sizes=6,7,8`
  - Results appear in the browser console and `window.__stressSummaries`.

### Lint/Format
- No linter/formatter is configured.
- Preserve existing formatting and style; do not introduce a tool without explicit approval.

## Cursor/Copilot Rules
- No Cursor rules found in `.cursor/rules/` or `.cursorrules`.
- No GitHub Copilot instructions found in `.github/copilot-instructions.md`.

## Code Style Guidelines
Follow the existing style and patterns. This project uses plain JavaScript and a DOM-driven architecture.

### JavaScript (main.js, puzzle-generator.js, visualizer.js)
- Indentation: 4 spaces.
- Semicolons: required (existing code uses them consistently).
- Quotes: single quotes for strings unless template literals are needed.
- Declarations:
  - Use `const` by default.
  - Use `let` when reassignment is required.
  - Avoid `var` (except legacy global usage in `visualizer.js`).
- Functions:
  - Prefer named function declarations for top-level utilities.
  - Keep helpers pure when possible; avoid hidden side effects.
  - Use `async`/`await` for async control flow (see `generatePuzzle`).
- Globals:
  - Global state is intentional (`n`, `board`, `solutionPath`, etc.).
  - When adding new globals, define them near existing top-level state.
  - Minimize new globals; prefer scoped variables inside functions.
- Arrays and objects:
  - Use array literals and `Array(n).fill(0).map(...)` like existing code.
  - Prefer `Set`/`Map` for membership checks and index lookups.
- Naming:
  - camelCase for variables and functions.
  - Uppercase `S`/`G` are labels, not variable names.
  - Use descriptive names for algorithm steps (e.g., `placeObstaclesSafely`).
- Control flow:
  - Guard early with `return` to reduce nesting.
  - Avoid deep nesting in new code; extract helper functions instead.
- Error handling:
  - Use `try/catch` around user input or browser APIs (e.g., clipboard, localStorage).
  - Log unexpected errors with `console.error` and fail safely.
- Performance:
  - Avoid blocking the UI thread during generation; use `await` + micro-yields.
  - Keep canvas redraws cohesive; call `drawBoard()` after state changes.

### HTML
- Keep IDs stable (DOM references depend on them).
- Prefer semantic structure; do not rename elements without updating JS.
- New UI elements should match existing button/input patterns.

### CSS
- Indentation: 2 spaces.
- Use existing IDs and class naming (`#control`, `#share-*`, `.info-line`).
- Keep color changes in the theme sections, especially for dark theme.
- Avoid introducing new global resets.

### Imports and Module Structure
- The project uses plain `<script>` tags, not ES modules.
- `puzzle-generator.js` is loaded before `main.js` and supplies shared helpers.
- Keep new helper functions in the file that owns the feature:
  - Algorithm/generation helpers in `puzzle-generator.js`.
  - UI/gameplay logic in `main.js`.
  - Visualization-only logic in `visualizer.js`.

## Functional Areas
- Puzzle generation logic: `puzzle-generator.js`
- Gameplay and UI: `main.js`
- Visualization: `visualizer.js`

## Editing Tips
- Preserve existing Japanese comments and text; follow the same tone when adding new ones.
- Only add comments when needed to explain non-obvious logic.
- Keep ASCII for new content unless matching existing non-ASCII UI text.
- When modifying puzzle generation, verify:
  - Start/goal remain on outer cells.
  - All passable cells are reachable.
  - `generatePuzzle()` remains time-bounded.

## Suggested Validation Steps
- Manual: open the app and try generate/reset/hint/share.
- Stress: use `?stress=1` to verify generation stability.
- Visualizer: open `visualizer.html` to inspect solver behavior.

## File Map
- `index.html`: main UI shell
- `main.js`: canvas drawing, UI events, gameplay
- `puzzle-generator.js`: generator + solver utilities
- `style.css`: UI and theme styling
- `visualizer.html`: solver visualization UI
- `visualizer.js`: visualization engine

## Change Hygiene
- Avoid touching unrelated files.
- If editing both algorithm and UI, keep changes localized and explain intent.
- Do not add new tooling or dependencies without discussion.
