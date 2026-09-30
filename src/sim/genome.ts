import type { Rng } from '../core/rng';
import type { Config } from '../core/config';
import { type Brain, type BrainJSON, brainFromJSON, createBrain } from './brain';

/** Всё, что наследуется: мозг, цвет семьи и (в будущем) числовые черты. */
export interface Genome {
  brain: Brain;
  /** оттенок 0..1 */
  hue: number;
  traits: Record<string, number>;
}

export interface GenomeJSON {
  brain: BrainJSON;
  hue: number;
  traits: Record<string, number>;
}

export function randomGenome(nIn: number, nOut: number, cfg: Config, rng: Rng): Genome {
  return { brain: createBrain(nIn, nOut, cfg, rng), hue: rng.next(), traits: {} };
}

/** Копия генома с мутациями — то, что получает потомок. */
export function inherit(g: Genome, cfg: Config, rng: Rng): Genome {
  const brain = g.brain.clone();
  brain.mutate(rng, { rate: cfg.mutRate, sigma: cfg.mutSigma, big: cfg.mutBig });
  let hue = g.hue + rng.gauss() * cfg.hueDrift;
  hue -= Math.floor(hue);
  return { brain, hue, traits: { ...g.traits } };
}

export function genomeToJSON(g: Genome): GenomeJSON {
  return { brain: g.brain.toJSON(), hue: Math.round(g.hue * 1e4) / 1e4, traits: g.traits };
}

export function genomeFromJSON(j: GenomeJSON): Genome {
  return { brain: brainFromJSON(j.brain), hue: j.hue, traits: j.traits ?? {} };
}
