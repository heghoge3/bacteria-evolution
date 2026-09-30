import type { Rng } from '../../core/rng';

export interface MutationParams {
  /** вероятность небольшого изменения веса */
  rate: number;
  /** сила изменения (σ) */
  sigma: number;
  /** вероятность полной замены веса случайным */
  big: number;
}

export interface BrainJSON {
  kind: string;
  [k: string]: unknown;
}

/** Любой «мозг» реализует этот интерфейс: MLP, рекуррентный, NEAT и т.д. */
export interface Brain {
  readonly kind: string;
  readonly nIn: number;
  readonly nOut: number;
  /** Все выходы в диапазоне [-1, 1]. */
  forward(inp: Float32Array, out: Float32Array): void;
  clone(): Brain;
  mutate(rng: Rng, m: MutationParams): void;
  toJSON(): BrainJSON;
}
