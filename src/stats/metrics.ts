import type { Accum, World } from '../sim/world';
import type { Bacterium } from '../sim/entities';
import { TRAITS } from '../sim/traits';
import { FP, TYPES } from '../sim/behavior';
import { seasonFactor } from '../sim/env';

export interface MetricCtx {
  world: World;
  acc: Accum;
  /** тиков прошло с прошлого замера */
  ticks: number;
  /** доли крупнейших семей по убыванию */
  lineageShares: number[];
  /** доли типов поведения */
  typeShares: number[];
  /** стратегий с долей ≥ 5 % */
  strategies: number;
  /** значение предыдущего замера (для метрик, у которых бывают пропуски) */
  prev: (id: string) => number;
}

export interface Metric {
  id: string;
  label: string;
  compute(c: MetricCtx): number;
}

const avg = (w: World, f: (b: Bacterium) => number): number => {
  const n = w.bacteria.length;
  if (!n) return NaN;
  let s = 0;
  for (const b of w.bacteria) s += f(b);
  return s / n;
};

const per100 = (v: number, c: MetricCtx) => (v * 100) / Math.max(1, c.ticks);

/** Реестр метрик: новая метрика = новая запись, график добавляется в ui/charts.ts */
export const METRICS: Metric[] = [
  { id: 'pop', label: 'Популяция', compute: (c) => c.world.bacteria.length },
  { id: 'food', label: 'Еда на поле', compute: (c) => c.world.foods.length },
  { id: 'season', label: 'Сезонный множитель еды', compute: (c) => seasonFactor(c.world.cfg, c.world.time) },
  { id: 'births', label: 'Рождений / 100 тиков', compute: (c) => per100(c.acc.births, c) },
  { id: 'deathsHunger', label: 'Смертей от голода / 100 тиков', compute: (c) => per100(c.acc.deathsHunger, c) },
  { id: 'deathsAge', label: 'Смертей от старости / 100 тиков', compute: (c) => per100(c.acc.deathsAge, c) },
  { id: 'avgGen', label: 'Среднее поколение', compute: (c) => avg(c.world, (b) => b.generation) },
  { id: 'maxGen', label: 'Максимальное поколение', compute: (c) => c.world.totals.maxGen },
  { id: 'avgEnergy', label: 'Средняя энергия', compute: (c) => avg(c.world, (b) => b.energy) },
  { id: 'avgLifespan', label: 'Средняя продолжительность жизни', compute: (c) => (c.acc.lifeN ? c.acc.lifeSum / c.acc.lifeN : c.prev('avgLifespan')) },
  {
    id: 'efficiency',
    label: 'Еды на бактерию за 1000 тиков',
    compute: (c) => {
      const pop = c.world.bacteria.length;
      return pop ? (c.acc.eaten / pop) * (1000 / Math.max(1, c.ticks)) : NaN;
    },
  },
  { id: 'directionality', label: 'Направленность на еду', compute: (c) => (c.acc.dirN ? c.acc.dirSum / c.acc.dirN : NaN) },
  { id: 'avgThrust', label: 'Средняя тяга', compute: (c) => (c.acc.thrustN ? c.acc.thrustSum / c.acc.thrustN : NaN) },
  { id: 'avgSpeed', label: 'Средняя скорость (поведение)', compute: (c) => avg(c.world, (b) => b.fp[FP.speed]) },
  { id: 'strategies', label: 'Число заметных стратегий', compute: (c) => c.strategies },
  ...TRAITS.map((t): Metric => ({ id: `trait_${t.key}`, label: `Черта: ${t.label}`, compute: (c) => avg(c.world, (b) => b.genome.traits[t.key]) })),
  ...TYPES.map((t, i): Metric => ({ id: `type${i}`, label: `Доля: ${t.name}`, compute: (c) => c.typeShares[i] ?? 0 })),
  ...[0, 1, 2, 3, 4].map((i): Metric => ({ id: `lin${i + 1}`, label: `Доля семьи №${i + 1}`, compute: (c) => c.lineageShares[i] ?? 0 })),
];
