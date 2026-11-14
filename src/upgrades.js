// Permanent upgrades bought with coins between levels.
export const UPGRADES = [
  { id: 'start', name: 'The gang', desc: '+2 friends at the start', icon: '🧢' },
  { id: 'power', name: 'Attitude', desc: '+15% damage', icon: '😎' },
  { id: 'rate', name: 'Sugar', desc: '+10% shots per second', icon: '🍬' },
];

const BASE = { start: 15, power: 25, rate: 25 };
const GROWTH = { start: 1.4, power: 1.45, rate: 1.45 };

export const upgradeCost = (id, lvl) => Math.round(BASE[id] * GROWTH[id] ** lvl);

export function upgradeStats(levels) {
  return {
    start: 1 + 2 * (levels.start ?? 0),
    dmgMul: 1 + 0.15 * (levels.power ?? 0),
    rateMul: 1 + 0.1 * (levels.rate ?? 0),
  };
}
