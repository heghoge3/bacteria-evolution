import type { Rng } from '../../core/rng';
import type { Config } from '../../core/config';
import type { Brain, BrainJSON } from './brain';
import { MLP } from './mlp';

export type { Brain, BrainJSON, MutationParams } from './brain';
export { MLP } from './mlp';

/** Реестр видов мозга: новый вид = новая запись. */
const loaders: Record<string, (j: BrainJSON) => Brain> = {
  mlp: (j) => MLP.fromJSON(j),
  rnn: (j) => MLP.fromJSON(j),
};

export function createBrain(nIn: number, nOut: number, cfg: Config, rng: Rng): Brain {
  return MLP.random(nIn, cfg.hiddenSize, nOut, rng, cfg.brainType === 1);
}

export function brainFromJSON(j: BrainJSON): Brain {
  const f = loaders[j.kind];
  if (!f) throw new Error(`Неизвестный тип мозга: ${j.kind}`);
  return f(j);
}
