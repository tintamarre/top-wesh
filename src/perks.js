// Perks: one of three is offered the first time a level is cleared. They stack, up to `max` each,
// and stay for good. Their effects live in sim.js (and in main.js for the coins).
export const PERKS = [
  { id: 'ricochet', name: 'Ricochet', icon: '↪️', max: 3, desc: 'Spent bullets bounce on: +20% chance' },
  { id: 'blast', name: 'Explosive rounds', icon: '🧨', max: 5, desc: '+5% of kills blow up' },
  { id: 'gates', name: 'Recruiter', icon: '📣', max: 5, desc: 'Plus gates give +10%' },
  { id: 'guard', name: 'Escort', icon: '🛡️', max: 3, desc: '+4 s of shield at the start' },
  { id: 'armor', name: 'Armour', icon: '🦺', max: 4, desc: '8% of losses are shrugged off' },
  { id: 'hazard', name: 'Light feet', icon: '🥾', max: 3, desc: 'Saws, spikes and walls take 20% less' },
  { id: 'power', name: 'Overcharge', icon: '🔋', max: 3, desc: 'Power-ups are 40% stronger' },
  { id: 'coins', name: 'Loot', icon: '💰', max: 5, desc: '+20% coins' },
  { id: 'sidearm', name: 'Sidearm', icon: '🔫', max: 1, desc: 'Start with an SMG or a Shotgun' },
];

// Three different perks that are not maxed out yet (fewer when almost everything is)
export function offerPerks(owned, rng = Math.random) {
  const pool = PERKS.filter((p) => (owned[p.id] ?? 0) < p.max);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}

export const HEROES = [
  { id: 'medic', name: 'Medic', icon: '🩺', cost: 150, desc: 'Revives 30% of the fallen every 5 s' },
  { id: 'sniper', name: 'Sniper', icon: '🎯', cost: 300, desc: 'Picks off marksmen, bombers, shields' },
  { id: 'tank', name: 'Tank', icon: '🪨', cost: 500, desc: 'Takes one heavy blow every 8 s' },
];

// Stars for a cleared level, from the share of soldiers kept
export function starsFor(left, lost) {
  const kept = left / Math.max(1, left + lost);
  return kept >= 0.8 ? 3 : kept >= 0.55 ? 2 : 1;
}
