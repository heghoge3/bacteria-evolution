import { PARAMS, presetConfig } from '../src/core/config';
import { Simulation } from '../src/sim/simulation';
import { TYPES } from '../src/sim/behavior';

/**
 * Подбор баланса: много запусков с разными seed, сводка выживания и разнообразия.
 * npm run balance -- [запусков=10] [тиков=100000] [preset=normal] [параметр=значение ...]
 * Для параллельности: seedFrom=N — первый seed.
 */
const args = process.argv.slice(2);
const runs = Number(args[0] ?? 10);
const ticks = Number(args[1] ?? 100000);
let preset = 'normal';
let seedFrom = 1;
const over: Record<string, number> = {};
for (const a of args.slice(2)) {
  const [k, v] = a.split('=');
  if (k === 'preset') preset = v;
  else if (k === 'seedFrom') seedFrom = Number(v);
  else if (!PARAMS.some((p) => p.key === k)) throw new Error(`нет параметра ${k}`);
  else over[k] = Number(v);
}

let survived = 0;
const t0 = Date.now();
const typeTime = TYPES.map(() => 0);
let diversitySum = 0, diversityN = 0;
for (let i = 0; i < runs; i++) {
  const seed = seedFrom + i;
  const sim = Simulation.create({ ...presetConfig(preset, seed), ...over });
  let div = 0, n = 0, popMin = Infinity, popMax = 0;
  const typesSeen = new Set<number>();
  while (sim.world.time < ticks && !sim.ended) {
    sim.run(1000);
    const c = sim.recorder.typeCounts;
    const tot = c.reduce((a, b) => a + b, 0) || 1;
    // «эффективное число типов» (обратный индекс Симпсона)
    const simpson = 1 / c.reduce((a, b) => a + (b / tot) ** 2, 0);
    div += simpson;
    n++;
    c.forEach((v, j) => {
      typeTime[j] += v / tot;
      if (v / tot > 0.2) typesSeen.add(j);
    });
    popMin = Math.min(popMin, sim.world.bacteria.length);
    popMax = Math.max(popMax, sim.world.bacteria.length);
  }
  diversitySum += div / n;
  diversityN++;
  const ok = !sim.ended;
  if (ok) survived++;
  const epochs = sim.recorder.chronicle.epochs.length;
  const top = sim.recorder.currentStrategies()[0];
  console.log(
    `seed ${String(seed).padEnd(4)} ${ok ? 'выжили ' : `вымерли на ${sim.world.extinctAt}`}  поп ${popMin}–${popMax}  ` +
      `поколение ${sim.world.totals.maxGen}  эпох ${epochs}  разнообр. ${(div / n).toFixed(2)}  ` +
      `типы>20%: ${[...typesSeen].map((j) => TYPES[j].name).join(', ')}  ${top ? `| сейчас: ${top.name} ${Math.round(top.share * 100)}%` : ''}`,
  );
}
const total = typeTime.reduce((a, b) => a + b, 0) || 1;
console.log(`\nвыжили ${survived}/${runs}; среднее разнообразие ${(diversitySum / diversityN).toFixed(2)} (1 — один тип, 5 — все поровну)`);
console.log(`доля времени по типам: ${TYPES.map((t, j) => `${t.name} ${Math.round((typeTime[j] / total) * 100)}%`).join(', ')}`);
console.log(`за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
