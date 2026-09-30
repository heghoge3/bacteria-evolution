import { defaultConfig, PARAMS, type Config } from '../src/core/config';
import { Simulation } from '../src/sim/simulation';

// Использование: npm run headless -- [тиков] [seed] [параметр=значение ...]
const args = process.argv.slice(2);
const ticks = Number(args[0] ?? 100000);
const cfg: Config = defaultConfig();
if (args[1]) cfg.seed = Number(args[1]);
for (const a of args.slice(2)) {
  const [k, v] = a.split('=');
  if (!PARAMS.some((p) => p.key === k)) throw new Error(`нет параметра ${k}`);
  (cfg as Record<string, number>)[k] = Number(v);
}

const sim = Simulation.create(cfg);
const t0 = Date.now();
const every = Math.max(1000, Math.floor(ticks / 20));
console.log('tick      pop  food  maxGen  dir    eff/1000  thrust  deathsH/A(total)');
for (let t = 0; t < ticks; t += every) {
  sim.run(every);
  const h = sim.recorder.history;
  const i = h.times.length - 1;
  const d = (id: string) => (h.data[id]?.[i] ?? 0).toFixed(2);
  const w = sim.world;
  console.log(
    `${String(w.time).padEnd(9)} ${String(w.bacteria.length).padEnd(4)} ${String(w.foods.length).padEnd(5)} ${String(w.totals.maxGen).padEnd(7)} ${d('directionality').padEnd(6)} ${d('efficiency').padEnd(9)} ${d('avgThrust').padEnd(7)} ${w.totals.deathsHunger}/${w.totals.deathsAge}  reseeds=${w.totals.reseeds}`,
  );
}
console.log(`готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
