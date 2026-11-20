# Blacktop Legends

An NBA 2K-style basketball game that runs in the browser on Cloudflare Workers. Build a MyPLAYER, then take them to the blacktop against the AI or your friends online.

## MyPLAYER Builder (`/`)

Build a player from scratch: identity, body, position, attributes, badges and animations. A live 3D model you can rotate updates as you go.

- **Identity**: name, nickname, jersey number, age, country, college/hometown. The name and number show on the 3D jersey.
- **Body & look**: height (5'7"–7'7"), weight, wingspan, body type, skin tone, 12 hairstyles, hair color, facial hair, eye color, 8 tattoo spots, jersey and shoe colors.
- **Positions**: PG / SG / SF / PF / C. Each position weights the overall rating differently.
- **22 attributes (25–99)** with 2K-style rules:
  - Height, weight, wingspan and body type set a **max cap** for every rating.
  - Each build has a **1,650-point budget**. Higher ratings cost more per point.
- **Overall rating** and **archetype** (e.g. *3-Level Scoring Threat*, *Defensive Anchor*), recalculated live.
- **41 badges** with Bronze → Legend tiers, unlocked from your ratings and paid for with badge points.
- **Animations**: jump shot, free throw, dribble, size-ups, layups, dunk packages and passing, each with rating or height requirements.
- **Saved builds** (kept in your browser), **share links**, **compare** two builds, a **random player** generator, and **reset**.

## Play (`/play.html`)

A 2K-style main menu over your 3D player, with four modes:

- **Play Now**: 2v2 or 3v3 against the AI. Choose a game to 11 or 21, 1s & 2s or 2s & 3s scoring, and Rookie through Hall of Fame difficulty.
- **Blacktop Online**: create a room and share the 4-letter code or invite link. Friends join from their own devices and pick **Home** or **Away**. AI fills empty spots, so co-op vs AI, 1v1 with AI teammates, and full 3v3 humans all work. The host sets the rules and starts once everyone is ready.
- **MyPLAYER**: jumps to the builder.
- **Settings**: sound, camera (Broadcast / Close) and player name tags.

Pick any of your saved builds or one of 8 preset players from the profile button. **Create New** opens the builder.

How a game plays:

- **Shot meter:** hold Shoot, then release in the white window. The window grows with your shooting ratings and badges and shrinks when a defender contests. Near the rim you get a layup or dunk, depending on your height, vertical and dunk ratings.
- **Ratings drive everything:** speed, steals, blocks, rebounding reach, finishing and passing lanes.
- **Streetball rules:** clear the ball past the arc after a steal or defensive rebound, a 20-second shot clock, and out of bounds is a turnover.
- **Box score and grade** at the end.

| Action | Keyboard | Phone |
| --- | --- | --- |
| Menus | Arrows, Enter, Esc | Tap |
| Move | WASD / arrows | Left stick |
| Sprint | Shift | Push the stick to the edge, or Sprint |
| Shoot (hold & release) / layup / dunk | Space | Shoot |
| Pass · call for the ball | E | Pass |
| Contest / block (defense) | Space | Block |
| Steal (defense) | E | Steal |
| Pause | Esc | Pause button |

### How online play works

`src/worker.js` serves the site and runs a `Room` **Durable Object** per room code (SQLite-backed, so it works on the Workers free plan). The room holds the lobby and relays messages over WebSockets:

- The **host's browser runs the game simulation**. It streams snapshots about 20 times a second, and other players send their controller input to the host.
- If a player disconnects, the AI takes over their player. If the host leaves, the game ends and the next player becomes host.
- The host should keep their tab open. The game keeps running if they switch tabs.
- Rooms expire after 6 hours.

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:8787. Online play needs `npm run dev` (Wrangler runs the Durable Object locally). A plain static server works for everything except online rooms.

## Deploy to Cloudflare

```bash
npx wrangler login
```

```bash
npm run deploy
```

This publishes a Worker named `blacktop-legends` with the static site and the `Room` Durable Object (see `wrangler.toml`). No other setup is needed.

## Tests

```bash
npm test
```

The tests cover the builder rules, the game engine (finished games, shot timing, court bounds), multiplayer pieces (per-player input, AI takeover, snapshot sync) and the fixed presets.

## Project layout

```
src/worker.js         Worker entry + Room Durable Object (lobby, WebSocket relay)
public/
  index.html          MyPLAYER builder
  play.html           main menu, lobby and game
  css/app.css         shared 2K-style UI (crimson & black)
  css/play.css        menus, lobby and game HUD
  js/data.js          attributes, caps, positions, badges, animations, appearance options
  js/build.js         builder rules: caps, costs, overall, archetype, badges, random, share codes
  js/player3d.js      Three.js player model, animation clips, showcase stage
  js/app.js           builder UI
  js/play.js          menus, lobby, game loop, HUD, networking glue
  js/game/sim.js      game engine: rules, ball physics, shooting, AI, snapshots
  js/game/view.js     3D court, in-game animation, camera
  js/game/input.js    keyboard + touch controls, synthesized sound
  js/game/net.js      WebSocket client for rooms
  js/game/presets.js  8 preset players (generated by scripts/gen-presets.js)
  vendor/             Three.js r170 (MIT)
test/                 node:test unit tests
wrangler.toml         Worker, assets and Durable Object config
```
