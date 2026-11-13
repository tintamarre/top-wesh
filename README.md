# Top Wesh

A squad-runner shooter in the browser: grow your squad through the gates, break barriers, shoot down the red horde and beat the Crusher mech at the end of each level.

**Play:** https://www.tintamarre.be/top-wesh/

## Features

- Your squad runs and shoots by itself: drag (or use the arrow keys / A D) to steer it.
- Gates: blue and yellow ones add soldiers, purple ones multiply, red ones take soldiers away. Some red gates can be shot until they turn blue.
- Three-lane sections: a long row of +1 gates, a lane full of red soldiers, or a barrier to break with big yellow gates behind it.
- Barrels and ice crates give a better gun (Pistol, SMG, Rifle, Minigun, Laser), jars free prisoners who join the squad.
- Red soldiers trade one for one when they reach you, brutes take four. The Crusher mech smashes the ground in front of it, a purple one waits every fifth level.
- Endless procedural levels on three maps (desert ruins, suspension bridge, snowy forest), with soldiers drawn as thousands of instanced meshes.
- Coins buy permanent upgrades between levels: Recruits, Firepower, Fire rate. Progress is saved in the browser.
- Synthesised sound effects (Web Audio, no sound files), touch and keyboard controls.

## Controls

| Input | Action |
| --- | --- |
| Drag left / right | Steer the squad |
| ← → / A D (Q on AZERTY) | Steer the squad |
| Esc / P | Pause |
| Enter / Space | Play, next level |

## Development

Requires Node 22+.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless balance test: bots play levels 1-15 with the pure simulation
npm run build    # static site in dist/
```

`node tests/shot.mjs <url> <out.png> [waitMs] [js] [extraWaitMs] [w,h]` takes a screenshot with headless Chrome.

## Code

| File | Role |
| --- | --- |
| `src/level.js` | Seeded procedural level generator (pure data) |
| `src/sim.js` | Game logic: formation, gates, bullets, enemies, boss. No rendering, so the tests can run it |
| `src/upgrades.js` | Permanent upgrades and their costs |
| `src/render.js` | Three.js scene: instanced soldiers, bullets and particles, gates, blocks, boss, scenery |
| `src/textures.js` | Canvas-drawn textures (gate signs, labels, hazard stripes) |
| `src/audio.js` | Web Audio sound effects |
| `src/main.js` | Screens, shop, input, game loop |

## Deployment

Every push to `main` runs the tests, builds with Vite and publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).
