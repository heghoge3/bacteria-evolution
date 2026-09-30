import type { Rng } from '../../core/rng';
import type { Brain, BrainJSON, MutationParams } from './brain';

const W_LIMIT = 6;

/** Полносвязная сеть: входы → скрытый слой (tanh) → выходы (tanh). */
export class MLP implements Brain {
  readonly kind = 'mlp';
  /** [нейрон скрытого слоя][вход] */
  w1: Float32Array;
  /** [выход][скрытый нейрон + смещение] */
  w2: Float32Array;
  /** последние активации скрытого слоя (для инспектора) */
  hidden: Float32Array;

  constructor(
    readonly nIn: number,
    readonly nHidden: number,
    readonly nOut: number,
    w1?: Float32Array,
    w2?: Float32Array,
  ) {
    this.w1 = w1 ?? new Float32Array(nHidden * nIn);
    this.w2 = w2 ?? new Float32Array(nOut * (nHidden + 1));
    this.hidden = new Float32Array(nHidden);
  }

  static random(nIn: number, nHidden: number, nOut: number, rng: Rng): MLP {
    const m = new MLP(nIn, nHidden, nOut);
    for (let i = 0; i < m.w1.length; i++) m.w1[i] = rng.gauss() * 0.8;
    for (let i = 0; i < m.w2.length; i++) m.w2[i] = rng.gauss() * 0.8;
    return m;
  }

  forward(inp: Float32Array, out: Float32Array): void {
    const { nIn, nHidden, nOut, w1, w2, hidden } = this;
    for (let j = 0; j < nHidden; j++) {
      let s = 0;
      const o = j * nIn;
      for (let i = 0; i < nIn; i++) s += w1[o + i] * inp[i];
      hidden[j] = Math.tanh(s);
    }
    const stride = nHidden + 1;
    for (let k = 0; k < nOut; k++) {
      const o = k * stride;
      let s = w2[o + nHidden];
      for (let j = 0; j < nHidden; j++) s += w2[o + j] * hidden[j];
      out[k] = Math.tanh(s);
    }
  }

  clone(): MLP {
    return new MLP(this.nIn, this.nHidden, this.nOut, this.w1.slice(), this.w2.slice());
  }

  mutate(rng: Rng, m: MutationParams): void {
    const apply = (w: Float32Array) => {
      for (let i = 0; i < w.length; i++) {
        const r = rng.next();
        if (r < m.big) w[i] = rng.gauss() * 0.8;
        else if (r < m.big + m.rate) w[i] = Math.max(-W_LIMIT, Math.min(W_LIMIT, w[i] + rng.gauss() * m.sigma));
      }
    };
    apply(this.w1);
    apply(this.w2);
  }

  toJSON(): BrainJSON {
    return {
      kind: this.kind,
      nIn: this.nIn,
      nHidden: this.nHidden,
      nOut: this.nOut,
      w1: Array.from(this.w1, round),
      w2: Array.from(this.w2, round),
    };
  }

  static fromJSON(j: BrainJSON): MLP {
    return new MLP(
      j.nIn as number,
      j.nHidden as number,
      j.nOut as number,
      Float32Array.from(j.w1 as number[]),
      Float32Array.from(j.w2 as number[]),
    );
  }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
