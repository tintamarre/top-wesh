# Top Wesh

A squad-runner shooter in the browser: grow your squad through the gates, break barriers, shoot down the red horde and beat the Crusher mech at the end of each level.

**Play:** https://www.tintamarre.be/top-wesh/

## Features

- Your squad runs and shoots by itself: drag (or use the arrow keys / A D) to steer it.
- Gates: blue and yellow ones add soldiers, purple ones multiply, red ones take soldiers away. Some red gates can be shot until they turn blue, some yellow gates slide from side to side, some come in threes.
- Eight guns that behave differently: Pistol, SMG, Shotgun (wide fan, short range), Rifle (long range), Minigun, Flamer (short cone that burns through the ranks), Rockets (explode), Laser (goes through everything). Barrels and ice crates often come in pairs: the gun you break is the gun you get. From level 6 the top guns are offered twice: the same one again earns a star (+25% damage).
- Power-up boxes: rage (double fire rate), shield (no losses for a few seconds), airstrike (clears the road and dents the boss). Jars free prisoners who join the squad.
- Obstacles to step around: spike strips, saw blades sweeping across the road, spiked iron balls rolling at you (bullets bounce off).
- Seven enemies: grunts, fast weaving runners, brutes, shield bearers that stop bullets, bombers that blow up their friends when shot early, marksmen firing orbs you can sidestep, and the iron balls.
- Three-lane sections: a long row of +1 gates, a lane full of red soldiers, or a barrier to break with big yellow gates behind it.
- Three bosses: the Crusher smashes the ground, the Blaster (even levels) keeps its distance and fires fans of orbs, the Titan (every fifth level) does both. They call reinforcements from level 3 and get angry below half health.
- Endless procedural levels on three maps (desert ruins, suspension bridge, snowy forest): each level draws its danger and reward segments from a pool that opens up with the level number, so no two levels play the same.
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
npm test         # headless balance test: bots play levels 1-15 with the pure simulation (about 20 s)
npm run build    # static site in dist/
```

`node tests/shot.mjs <url> <out.png> [waitMs] [js] [extraWaitMs] [w,h]` takes a screenshot with headless Chrome.

## Code

| File | Role |
| --- | --- |
| `src/level.js` | Seeded procedural level generator (pure data): danger and growth segments, unlock levels, boss type |
| `src/sim.js` | Game logic: formation, gates, guns and bullets, enemies, hazards, power-ups, bosses. No rendering, so the tests can run it |
| `src/upgrades.js` | Permanent upgrades and their costs |
| `src/render.js` | Three.js scene: instanced soldiers (one mesh per enemy kind), bullets, orbs and particles, gates, blocks, hazards, boss, scenery |
| `src/textures.js` | Canvas-drawn textures (gate signs, labels, hazard stripes) |
| `src/audio.js` | Web Audio sound effects |
| `src/main.js` | Screens, shop, input, game loop |

## Deployment

Every push to `main` runs the tests, builds with Vite and publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).
