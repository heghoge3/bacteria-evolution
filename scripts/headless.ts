import { PARAMS, type Config, presetConfig } from '../src/core/config';
import { Simulation } from '../src/sim/simulation';
import { TYPES } from '../src/sim/behavior';

// Использование: npm run headless -- [тиков] [seed] [preset=normal] [параметр=значение ...]
const args = process.argv.slice(2);
const ticks = Number(args[0] ?? 100000);
let preset = 'normal';
const over: Record<string, number> = {};
for (const a of args.slice(2)) {
  const [k, v] = a.split('=');
  if (k === 'preset') preset = v;
  else if (!PARAMS.some((p) => p.key === k)) throw new Error(`нет параметра ${k}`);
  else over[k] = Number(v);
}
const cfg: Config = { ...presetConfig(preset), ...over };
if (args[1]) cfg.seed = Number(args[1]);

const sim = Simulation.create(cfg);
const t0 = Date.now();
const every = Math.max(1000, Math.floor(ticks / 20));
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
console.log('tick     pop   food  gen   dir    eff   size  speed vision divF  share | типы (%)');
for (let t = 0; t < ticks && !sim.ended; t += every) {
  sim.run(every);
  const h = sim.recorder.history;
  const w = sim.world;
  const types = sim.recorder.typeCounts.map((c) => Math.round((c / Math.max(1, w.bacteria.length)) * 100)).join('/');
  console.log(
    `${String(w.time).padEnd(8)} ${String(w.bacteria.length).padEnd(5)} ${String(w.foods.length).padEnd(5)} ${String(w.totals.maxGen).padEnd(5)} ` +
      `${f(h.last('directionality')).padEnd(6)} ${f(h.last('efficiency')).padEnd(5)} ${f(h.last('trait_size')).padEnd(5)} ${f(h.last('trait_speed')).padEnd(5)} ` +
      `${f(h.last('trait_vision')).padEnd(6)} ${f(h.last('trait_divFood')).padEnd(5)} ${f(h.last('trait_childShare')).padEnd(5)} | ${types}`,
  );
}
if (sim.ended) console.log(`ВЫМЕРЛИ на тике ${sim.world.extinctAt}`);
console.log(`типы: ${TYPES.map((t) => t.name).join(' / ')}`);
console.log('стратегии сейчас:');
for (const s of sim.recorder.currentStrategies().slice(0, 8)) console.log(`  ${Math.round(s.share * 100)}%  ${s.name}`);
console.log('хроника:');
for (const e of sim.recorder.chronicle.render(sim.world.time)) console.log(`  ${e.title}\n    ${e.body.join('\n    ')}`);
console.log(`готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
