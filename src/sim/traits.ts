import type { Config } from '../core/config';
import type { Rng } from '../core/rng';

/**
 * Наследуемые черты тела. Каждая чего-то стоит — см. физику в systems.
 * Добавить черту = добавить запись сюда и использовать её в нужной системе.
 */
export interface TraitDef {
  key: TraitKey;
  label: string;
  min: number;
  max: number;
  /** мутация: 'mul' — умножение на e^(σ·g), 'add' — прибавление σ·g·scale */
  mode: 'mul' | 'add';
  scale?: number;
  init(cfg: Config): number;
  fmt(v: number): string;
}

export type TraitKey = 'size' | 'speed' | 'vision' | 'divFood' | 'childShare' | 'lifespan';

const x = (v: number) => `×${v.toFixed(2)}`;

export const TRAITS: TraitDef[] = [
  { key: 'size', label: 'Размер', min: 0.5, max: 2.5, mode: 'mul', init: () => 1, fmt: x },
  { key: 'speed', label: 'Скорость', min: 0.3, max: 2.5, mode: 'mul', init: () => 1, fmt: x },
  { key: 'vision', label: 'Зрение', min: 0.3, max: 2.5, mode: 'mul', init: () => 1, fmt: x },
  { key: 'divFood', label: 'Еды до деления', min: 1, max: 12, mode: 'mul', init: (c) => c.divideFood, fmt: (v) => v.toFixed(1) },
  { key: 'childShare', label: 'Доля энергии потомку', min: 0.1, max: 0.9, mode: 'add', scale: 0.5, init: () => 0.5, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'lifespan', label: 'Долголетие', min: 0.3, max: 2.5, mode: 'mul', init: () => 1, fmt: x },
];

export type Traits = Record<TraitKey, number>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function initialTraits(cfg: Config, rng: Rng): Traits {
  const t = {} as Traits;
  for (const d of TRAITS) {
    let v = d.init(cfg);
    // небольшое стартовое разнообразие, чтобы отбору было из чего выбирать
    if (cfg.evoTraits) v = d.mode === 'mul' ? v * Math.exp(rng.gauss() * 0.1) : v + rng.gauss() * 0.05;
    t[d.key] = clamp(v, d.min, d.max);
  }
  return t;
}

export function mutateTraits(t: Traits, cfg: Config, rng: Rng): Traits {
  const out = { ...t };
  if (!cfg.evoTraits) return out;
  const s = cfg.traitSigma;
  for (const d of TRAITS) {
    const v = out[d.key];
    const nv = d.mode === 'mul' ? v * Math.exp(rng.gauss() * s) : v + rng.gauss() * s * (d.scale ?? 1);
    out[d.key] = clamp(nv, d.min, d.max);
  }
  return out;
}

/** Достраивает черты из старого сохранения. */
export function normalizeTraits(raw: Record<string, number> | undefined, cfg: Config): Traits {
  const t = {} as Traits;
  for (const d of TRAITS) t[d.key] = typeof raw?.[d.key] === 'number' ? raw[d.key] : d.init(cfg);
  return t;
}
