# Blacktop Legends: MyPLAYER Builder

An NBA 2K-style MyPLAYER creator that runs entirely in the browser and deploys as a Cloudflare Worker.

Build a player from scratch: identity, body, position, attributes, badges and animations. A live 3D model you can rotate updates as you go.

## Features

- **Identity**: name, nickname, jersey number, age, country, college/hometown. The name and number show on the 3D jersey.
- **Body & look**: height (5'7"–7'7"), weight, wingspan, body type, skin tone, 12 hairstyles, hair color, facial hair, eye color, 8 tattoo spots, jersey and shoe colors.
- **Positions**: PG / SG / SF / PF / C. Each position weights the overall rating differently, and the buttons show what your ratings are worth at every position.
- **22 attributes (25–99)** in 6 categories, with 2K-style rules:
  - Height, weight, wingspan and body type set a **max cap** for every rating.
  - Each build has a **1,650-point budget**. Higher ratings cost more per point.
- **Overall rating** and **archetype**, recalculated live (e.g. *3-Level Scoring Threat*, *Inside-Out Playmaker*, *Defensive Anchor*, *Two-Way Sharpshooter*, *Stretch Rim Protector*).
- **41 badges** with Bronze → Silver → Gold → Hall of Fame → Legend tiers. Badges unlock from your ratings and cost badge points, and your overall sets how many points you get. Includes Auto-Equip.
- **Animations**: jump shot, free throw, dribble style, size-ups, layup package, up to 3 dunk packages, and passing style. Each has rating or height requirements, and each plays on the 3D model.
- **3D preview**: drag to rotate, scroll or pinch to zoom, Full / Upper / Face cameras, and auto-rotate.
- **Saved builds** (kept in your browser), **share links** (the whole build is encoded in the URL), **compare** any two builds with a radar chart and a stat-by-stat table, **random player** generator, and **reset**.
- Responsive layout for phones and desktops.

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:8787.

Any static server works too, because there is no build step:

```bash
cd public && python3 -m http.server 8787
```

## Deploy to Cloudflare

```bash
npx wrangler login
```

```bash
npm run deploy
```

This publishes a Worker named `blacktop-legends` that serves `public/` as static assets (see `wrangler.toml`). No database or other bindings are needed.

## Tests

```bash
npm test
```

The tests cover the rules engine: caps, budget, badges, animation unlocks, sanitizing share links, and share-code round trips.

## Project layout

```
public/
  index.html          app shell
  css/app.css         2K-style UI
  js/data.js          attributes, caps, positions, badges, animations, appearance options
  js/build.js         rules engine: caps, costs, overall, archetype, badges, random, share codes
  js/player3d.js      Three.js scene, procedural player model, animation clips
  js/app.js           UI: tabs, sliders, saving, compare, toasts
  vendor/             Three.js r170 (MIT)
test/                 node:test unit tests
wrangler.toml         Cloudflare Worker config (static assets)
```
