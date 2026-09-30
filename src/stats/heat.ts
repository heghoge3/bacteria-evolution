import type { Bacterium } from '../sim/entities';
import type { World } from '../sim/world';
import { TRAITS } from '../sim/traits';
import { FP } from '../sim/behavior';

/** Величина, распределение которой показывается тепловой картой. */
export interface HeatDef {
  id: string;
  label: string;
  group: 'Черты тела' | 'Поведение';
  min: number;
  max: number;
  value(b: Bacterium, w: World): number;
  fmt(v: number): string;
}

export const HEAT_BINS = 24;

const f2 = (v: number) => v.toFixed(2);

export const HEATS: HeatDef[] = [
  { id: 'b_speed', label: 'Скорость движения', group: 'Поведение', min: 0, max: 2, value: (b) => b.fp[FP.speed], fmt: f2 },
  { id: 'b_turn', label: 'Резкость поворотов', group: 'Поведение', min: 0, max: 1, value: (b) => b.fp[FP.turn], fmt: f2 },
  { id: 'b_dir', label: 'Направленность к еде', group: 'Поведение', min: -0.5, max: 1, value: (b) => b.fp[FP.directed], fmt: f2 },
  { id: 'b_wall', label: 'Близость к стенам', group: 'Поведение', min: 0, max: 1, value: (b) => b.fp[FP.wall], fmt: f2 },
  { id: 'b_crowd', label: 'Теснота', group: 'Поведение', min: 0, max: 1, value: (b) => b.fp[FP.crowd], fmt: f2 },
  { id: 'b_food', label: 'Еды в поле зрения', group: 'Поведение', min: 0, max: 1, value: (b) => b.fp[FP.foodRich], fmt: f2 },
  { id: 'b_energy', label: 'Запас энергии (доля)', group: 'Поведение', min: 0, max: 1, value: (b, w) => b.energy / w.maxEnergyOf(b), fmt: f2 },
  ...TRAITS.map(
    (t): HeatDef => ({
      id: `t_${t.key}`, label: t.label, group: 'Черты тела', min: t.min, max: t.key === 'divFood' ? 10 : t.max,
      value: (b) => b.genome.traits[t.key], fmt: t.fmt,
    }),
  ),
];

/** Гистограммы всех величин: доли бактерий по корзинам. */
export function histograms(w: World): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const n = w.bacteria.length;
  for (const d of HEATS) {
    const h = new Array(HEAT_BINS).fill(0);
    if (n) {
      const span = d.max - d.min;
      for (const b of w.bacteria) {
        const i = Math.floor(((d.value(b, w) - d.min) / span) * HEAT_BINS);
        h[Math.min(HEAT_BINS - 1, Math.max(0, i))]++;
      }
      for (let i = 0; i < HEAT_BINS; i++) h[i] = Math.round((h[i] / n) * 1000) / 1000;
    }
    out[d.id] = h;
  }
  return out;
}
