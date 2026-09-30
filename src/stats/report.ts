import { PARAMS, defaultConfig } from '../core/config';
import { seasonName } from '../sim/env';
import type { Simulation } from '../sim/simulation';
import { STRATEGY_SHARE } from './recorder';

export interface RunSummary {
  id: string;
  date: string;
  seed: number;
  preset: string;
  reason: 'extinct' | 'manual';
  ticks: number;
  cause: string;
  maxPop: number;
  maxGen: number;
  births: number;
  deathsHunger: number;
  deathsAge: number;
  founders: number;
  longest: { id: number; ticks: number } | null;
  strategies: { name: string; peak: number; type: number }[];
  chronicle: { title: string; body: string[]; type: number }[];
  series: { t: number[]; pop: number[]; dir: number[]; gen: number[] };
  cfgDiff: Record<string, number>;
}

const POINTS = 240;

function downsample(t: number[], a: number[]): number[] {
  if (t.length <= POINTS) return a.map((v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : NaN));
  const out: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    const v = a[Math.floor((i * (t.length - 1)) / (POINTS - 1))];
    out.push(Number.isFinite(v) ? Math.round(v * 1000) / 1000 : NaN);
  }
  return out;
}

export function buildSummary(sim: Simulation, reason: RunSummary['reason'], preset: string): RunSummary {
  const w = sim.world;
  const r = sim.recorder;
  const v = r.history.view();
  const pop = v.max.pop ?? [];
  const maxPop = pop.reduce((m, x) => (Number.isFinite(x) && x > m ? x : m), 0);

  // что убило: смотрим на последние замеры
  let cause = 'Запуск остановлен вручную.';
  if (reason === 'extinct') {
    const n = v.t.length;
    let h = 0, a = 0;
    for (let i = Math.max(0, n - 20); i < n; i++) {
      h += v.mean.deathsHunger[i] || 0;
      a += v.mean.deathsAge[i] || 0;
    }
    const season = seasonName(w.cfg, w.time);
    cause = h >= a ? 'Популяция вымерла от голода' : 'Популяция вымерла от старости — не успевала размножаться';
    if (season) cause += ` (время года — ${season})`;
    cause += '.';
  }

  let longest: RunSummary['longest'] = null;
  for (const l of r.lineages.values()) {
    const d = l.last - l.first;
    if (!longest || d > longest.ticks) longest = { id: l.id, ticks: d };
  }

  const def = defaultConfig();
  const cfgDiff: Record<string, number> = {};
  for (const p of PARAMS) if (w.cfg[p.key] !== def[p.key] && p.key !== 'seed') cfgDiff[p.key] = w.cfg[p.key];

  return {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    seed: w.cfg.seed,
    preset,
    reason,
    ticks: w.extinct ? w.extinctAt : w.time,
    cause,
    maxPop,
    maxGen: w.totals.maxGen,
    births: w.totals.births,
    deathsHunger: w.totals.deathsHunger,
    deathsAge: w.totals.deathsAge,
    founders: w.totals.founders,
    longest,
    strategies: [...r.strategies.values()]
      .filter((s) => s.peakShare >= STRATEGY_SHARE)
      .sort((a, b) => b.peakShare - a.peakShare)
      .slice(0, 8)
      .map((s) => ({ name: s.name, peak: s.peakShare, type: s.type })),
    chronicle: r.chronicle.render(w.time),
    series: {
      t: downsample(v.t, v.t),
      pop: downsample(v.t, v.mean.pop ?? []),
      dir: downsample(v.t, v.mean.directionality ?? []),
      gen: downsample(v.t, v.mean.maxGen ?? []),
    },
    cfgDiff,
  };
}

/** Отчёт в виде текста (Markdown) для сохранения в файл. */
export function summaryToMarkdown(s: RunSummary): string {
  const lines = [
    `# Отчёт о запуске (seed ${s.seed})`,
    '',
    `- Дата: ${new Date(s.date).toLocaleString('ru-RU')}`,
    `- Пресет: ${s.preset}`,
    `- Прожито тиков: ${s.ticks.toLocaleString('ru-RU')}`,
    `- Итог: ${s.cause}`,
    `- Макс. популяция: ${s.maxPop}, макс. поколение: ${s.maxGen}`,
    `- Рождений: ${s.births}, смертей от голода: ${s.deathsHunger}, от старости: ${s.deathsAge}`,
    s.longest ? `- Дольше всех прожила семья №${s.longest.id}: ${s.longest.ticks.toLocaleString('ru-RU')} тиков` : '',
    '',
    '## Стратегии',
    ...s.strategies.map((x) => `- ${x.name} — до ${Math.round(x.peak * 100)} %`),
    '',
    '## Хроника',
    ...s.chronicle.flatMap((e) => [`### ${e.title}`, ...e.body, '']),
    '## Изменённые параметры',
    ...Object.entries(s.cfgDiff).map(([k, v]) => `- ${k} = ${v}`),
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}
