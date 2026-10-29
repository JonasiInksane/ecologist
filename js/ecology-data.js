// Game-scale archetypes. Quotas are explicit balancing defaults, not species-independent measurements.
const ECO_DAY = 10800;
const ECO_QUOTA = { n: 0.1, p: 0.01 };
const ECO_ANIMALS = {
  fish: { body: 12, reserve: 10.8, burn: 0.001, n: 0.1, p: 0.01 },
  pike: { body: 24, reserve: 14.4, burn: 0.002, n: 0.1, p: 0.01 },
  moth: { body: 2, reserve: 1.2, burn: 1.2 / 10800, n: 0.1, p: 0.01 },
  bee: { body: 2, reserve: 1.2, burn: 1.2 / 10800, n: 0.1, p: 0.01 },
  bird: { body: 6, reserve: 4.8, burn: 4.8 / 14400, n: 0.1, p: 0.01 },
};
const ECO_C = { sugar: 60, ethanol: 20, honey: 60 };
const ECO_COST = { stem: 6, leaf: 3, flower: 1, wood: 40, moss: 3, wax: 2, seed: 12 };
const ECO_RATE = { decay: 0.02, algaeGrow: 0.005, algaeRespire: 0.001, algaeDeath: 0.002,
  algaeMaxTemp: 40, algaeMaxSalt: 50, microbeMaxTemp: 45,
  decayScale: 10,
  beeLoad: 0.2, beeMinNectar: 0.02, nectarMax: 200, sporeBank: 5,
  leafBite: 1.5,
  yeastMax: 200, yeastTolerance: 36, nitrateCarbon: 1.25, algaeMinTemp: 8, algaeCoolTemp: 15,
  soilCarbon: 2, soilN: 1, soilP: 0.1, waterN: 3, waterP: 0.3, yeastYield: 0.1,
  anaerobicYeastYield: 0.05, growthLimit: 255, starvingGrace: 300, epsilon: 1e-10 };
export { ECO_DAY, ECO_QUOTA, ECO_ANIMALS, ECO_C, ECO_COST, ECO_RATE };
