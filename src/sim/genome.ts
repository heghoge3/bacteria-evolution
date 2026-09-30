import type { Rng } from '../core/rng';
import type { Config } from '../core/config';
import { type Brain, type BrainJSON, brainFromJSON, createBrain } from './brain';
import { type Traits, initialTraits, mutateTraits, normalizeTraits } from './traits';

/** Всё, что наследуется: мозг, цвет семьи и черты тела. */
export interface Genome {
  brain: Brain;
  /** оттенок 0..1 */
  hue: number;
  traits: Traits;
}

export interface GenomeJSON {
  brain: BrainJSON;
  hue: number;
  traits?: Record<string, number>;
}

export function randomGenome(nIn: number, nOut: number, cfg: Config, rng: Rng): Genome {
  return { brain: createBrain(nIn, nOut, cfg, rng), hue: rng.next(), traits: initialTraits(cfg, rng) };
}

/** Копия генома с мутациями — то, что получает потомок. */
export function inherit(g: Genome, cfg: Config, rng: Rng): Genome {
  const brain = g.brain.clone();
  brain.mutate(rng, { rate: cfg.mutRate, sigma: cfg.mutSigma, big: cfg.mutBig });
  let hue = g.hue + rng.gauss() * cfg.hueDrift;
  hue -= Math.floor(hue);
  return { brain, hue, traits: mutateTraits(g.traits, cfg, rng) };
}

/** Точная копия (для аквариума и экзамена). */
export function cloneGenome(g: Genome): Genome {
  return { brain: g.brain.clone(), hue: g.hue, traits: { ...g.traits } };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function genomeToJSON(g: Genome): GenomeJSON {
  const traits: Record<string, number> = {};
  for (const k of Object.keys(g.traits) as (keyof Traits)[]) traits[k] = r4(g.traits[k]);
  return { brain: g.brain.toJSON(), hue: r4(g.hue), traits };
}

export function genomeFromJSON(j: GenomeJSON, cfg: Config): Genome {
  return { brain: brainFromJSON(j.brain), hue: j.hue, traits: normalizeTraits(j.traits, cfg) };
}
