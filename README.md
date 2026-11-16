# Top Wesh

A squad-runner in the browser that makes fun of war games: you lead a gang of teenagers armed with water guns and party poppers against the grown-ups. Nobody gets hurt, a soaked supervisor just goes home. Call friends through the gates, step around the toy bricks, and face the Dad and his flip-flop at the end of each level.

**Play:** https://www.tintamarre.be/top-wesh/

## Features

- The gang runs and shoots by itself: drag (or use the arrow keys / A D) to steer it.
- WESH! One button (or Space) makes the gang shout: grown-ups around are thrown back and stay dazed, chalk flies back at whoever threw it, homework balls roll off the road, and a boss loses the blow it was preparing. Six seconds to get your breath back.
- From level 2 the Mum follows with her vacuum cleaner. She is slower than the gang, but she catches up whenever it stalls in front of a crowd, a jar or a barrier, and vacuums up the last rows. Break through fast, step aside or shout to send her back. She goes home when the boss shows up.
- Gates count as soon as the first row reaches them: blue and yellow ones bring friends, purple ones multiply, red ones send friends home. Some red gates can be shot until they turn blue, some yellow gates slide from side to side, some come in threes.
- Eight toys that behave differently: Spitballs, Water gun, Party popper (wide fan, short range), Foam darts (long range), Bubble gun (very fast), Deo spray (short cloud that goes through the ranks), Water balloons (splash), Laser pointer (goes through everything). Barrels and ice crates often come in pairs: the one you break is the one you get. From level 6 the top toys are offered twice: the same one again earns a star (+25% damage).
- Power-up boxes: energy drink (double fire rate), headphones (nothing reaches you for a few seconds), bass drop (clears the road and dents the boss). Jars get friends out of detention.
- A big gang closes ranks into a column no wider than 42% of the road, so whatever its size there is a free side to go to.
- Obstacles to step around: toy bricks on the floor, giant fidget spinners sweeping one half of the road, walls closing in around a moving gap, giant balls of crumpled homework rolling at you (nothing stops homework, except a good shout).
- Seven kinds of grown-ups and other nuisances: supervisors, little brothers (fast, weaving), gym teachers (big), librarians behind a ring binder that stops everything, surprise tests that blow up in a cloud of paper, maths teachers throwing chalk you can sidestep, and the homework.
- Three-lane sections: a long row of +1 gates, a lane full of supervisors, or a barrier to break with big yellow gates behind it. From level 5 the road also forks: an easy side with small gates, or a guarded side with a big jar, a big gate and coins.
- Coins lie on the road, often next to a hazard. After every third level a coin rush has no grown-ups, only a trail of coins weaving between traps.
- Three bosses: the Dad smashes the ground with his flip-flop, the Teacher (even levels) keeps her distance and throws chalk in fans through two megaphones, the Principal (every fifth level) does both. They call for backup from level 3 and have had enough below half health.
- Endless procedural levels across seven sceneries (desert ruins, meadow, suspension bridge, ruins by night where you only see what your lamp reaches, snowy forest, city, lava field). The scenery changes two or three times within a level, and from level 3 the road is wide, normal or narrow depending on the level.
- Stars and a level map: ★★★ for finishing with 80% of the gang, ★★ for 55%. Any unlocked level can be replayed from the map, and new stars pay coins.
- Perks: the first time a level is cleared, pick one of three (Trick shot, Mint and cola, Group chat, Not listening, Puffer jacket, Fresh sneakers, Power bank, Pocket money, Starter pack). They stack and stay for good.
- Heroes bought with coins walk with the gang: Big sister brings back 30% of the lost every 5 s, The gamer tags the most annoying grown-up, Big brother takes one big telling-off every 8 s.
- Coins also buy permanent upgrades between levels: The gang, Attitude, Sugar. Progress is saved in the browser.
- Synthesised sound effects (Web Audio, no sound files), touch and keyboard controls.

## Controls

| Input | Action |
| --- | --- |
| Drag left / right | Steer the gang |
| ← → / A D (Q on AZERTY) | Steer the gang |
| WESH! button / Space / ↑ / W (Z on AZERTY) | Shout |
| Esc / P | Pause |
| Enter / Space | Play, next level |

## Development

Requires Node 22+.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless balance test: bots play levels 1-15 with the pure simulation, shouting when it helps (about 20 s)
npm run build    # static site in dist/
```

`node tests/shot.mjs <url> <out.png> [waitMs] [js] [extraWaitMs] [w,h]` takes a screenshot with headless Chrome.

## Code

The code keeps the plain names of the genre (`grunt`, `brute`, `shield`, `bomber`, `shooter`, `boulder`, `saw`, `spikes`, `crusher`…). What the player sees and reads is set in the `WEAPONS` and `BOSS_NAMES` tables of `src/sim.js`, in `src/perks.js`, `src/upgrades.js` and in the models of `src/render.js`.

| File | Role |
| --- | --- |
| `src/level.js` | Seeded procedural level generator (pure data): danger and growth segments, unlock levels, boss type |
| `src/sim.js` | Game logic: formation, gates, guns and bullets, enemies, hazards, power-ups, bosses. No rendering, so the tests can run it |
| `src/upgrades.js` | Permanent upgrades and their costs |
| `src/perks.js` | Perks, heroes and the star rating |
| `src/render.js` | Three.js scene: instanced soldiers (one mesh per enemy kind), bullets, orbs and particles, gates, blocks, hazards, boss, scenery |
| `src/textures.js` | Canvas-drawn textures (gate signs, labels, hazard stripes) |
| `src/audio.js` | Web Audio sound effects |
| `src/main.js` | Screens, shop, level map, perk choice, input, game loop |

## Deployment

Every push to `main` runs the tests, builds with Vite and publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).
