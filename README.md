# X2pack

A mobile-first progressive web app (PWA) for managing travel pack lists.

## What it does

X2pack lets you build reusable **pack lists** (e.g. "Toiletries", "Electronics") and then start a **packing session** that pulls items from one or more of those lists. During packing, each item cycles through three states — pending → packed → skipped — with a progress bar tracking your progress. When all items are resolved the session is marked done.

All data is stored locally in the browser using IndexedDB. No account or server required.

## Features

- Create and manage reusable pack lists with ordering support
- Start a packing session from any combination of lists
- Per-item status cycling: pending / packed / skipped
- Add ad-hoc items to any active session
- Session history with active and done sections
- Installable as a PWA (works offline, home screen icon)

## Tech stack

- [React 19](https://react.dev/) — UI
- [Vite 6](https://vitejs.dev/) — build and dev server
- [TypeScript 5](https://www.typescriptlang.org/) — type safety
- [idb](https://github.com/jakearchibald/idb) — IndexedDB wrapper
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — PWA manifest and service worker
- [Vitest](https://vitest.dev/) — unit tests

## Getting started

```bash
npm install
npm run dev
```

Open the URL printed by Vite. On mobile, use the LAN address shown to access it over Wi-Fi.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (LAN-accessible) |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run unit tests |
| `npm run coverage` | Run tests with coverage report |
