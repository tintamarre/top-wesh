// Perks: one of three is offered the first time a level is cleared. They stack, up to `max` each,
// and stay for good. Their effects live in sim.js (and in main.js for the coins).
export const PERKS = [
  { id: 'ricochet', name: 'Trick shot', icon: '🏀', max: 3, desc: 'Shots bounce on: +20% chance' },
  { id: 'blast', name: 'Mint and cola', icon: '🧪', max: 5, desc: '+5% of hits go off like a geyser' },
  { id: 'gates', name: 'Group chat', icon: '💬', max: 5, desc: 'Plus gates bring +10% friends' },
  { id: 'guard', name: 'Not listening', icon: '🎧', max: 3, desc: '+4 s of headphones at the start' },
  { id: 'armor', name: 'Puffer jacket', icon: '🧥', max: 4, desc: '8% of losses are shrugged off' },
  { id: 'hazard', name: 'Fresh sneakers', icon: '👟', max: 3, desc: 'Bricks, spinners and walls take 20% less' },
  { id: 'power', name: 'Power bank', icon: '🔋', max: 3, desc: 'Power-ups are 40% stronger' },
  { id: 'coins', name: 'Pocket money', icon: '💰', max: 5, desc: '+20% coins' },
  { id: 'sidearm', name: 'Starter pack', icon: '🎒', max: 1, desc: 'Start with a Water gun or a Party popper' },
];

// Three different perks that are not maxed out yet (fewer when almost everything is)
export function offerPerks(owned, rng = Math.random) {
  const pool = PERKS.filter((p) => (owned[p.id] ?? 0) < p.max);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}

export const HEROES = [
  { id: 'medic', name: 'Big sister', icon: '🩹', cost: 150, desc: 'Brings back 30% of the lost every 5 s' },
  { id: 'sniper', name: 'The gamer', icon: '🎮', cost: 300, desc: 'Aimbot: tags the most annoying grown-up' },
  { id: 'tank', name: 'Big brother', icon: '💪', cost: 500, desc: 'Takes one big telling-off every 8 s' },
];

// Stars for a cleared level, from the share of soldiers kept
export function starsFor(left, lost) {
  const kept = left / Math.max(1, left + lost);
  return kept >= 0.8 ? 3 : kept >= 0.55 ? 2 : 1;
}
