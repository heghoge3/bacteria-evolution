import type { Rng } from '../../core/rng';
import type { Brain, BrainJSON, MutationParams } from './brain';

const W_LIMIT = 6;
const INIT_SD = 0.8;

/**
 * Полносвязная сеть: входы → скрытый слой (tanh) → выходы (tanh).
 * С `recurrent` скрытые нейроны получают ещё и своё состояние с прошлого тика —
 * это даёт бактерии кратковременную память.
 */
export class MLP implements Brain {
  readonly kind: string;
  /** [нейрон скрытого слоя][вход] */
  w1: Float32Array;
  /** [выход][скрытый нейрон + смещение] */
  w2: Float32Array;
  /** [скрытый][скрытый] — рекуррентные связи или null */
  wr: Float32Array | null;
  /** текущие активации скрытого слоя (для памяти и инспектора) */
  hidden: Float32Array;
  private prev: Float32Array;

  constructor(
    readonly nIn: number,
    readonly nHidden: number,
    readonly nOut: number,
    recurrent = false,
    w1?: Float32Array,
    w2?: Float32Array,
    wr?: Float32Array | null,
  ) {
    this.kind = recurrent ? 'rnn' : 'mlp';
    this.w1 = w1 ?? new Float32Array(nHidden * nIn);
    this.w2 = w2 ?? new Float32Array(nOut * (nHidden + 1));
    this.wr = recurrent ? (wr ?? new Float32Array(nHidden * nHidden)) : null;
    this.hidden = new Float32Array(nHidden);
    this.prev = new Float32Array(nHidden);
  }

  get recurrent(): boolean {
    return this.wr !== null;
  }

  static random(nIn: number, nHidden: number, nOut: number, rng: Rng, recurrent = false): MLP {
    const m = new MLP(nIn, nHidden, nOut, recurrent);
    for (let i = 0; i < m.w1.length; i++) m.w1[i] = rng.gauss() * INIT_SD;
    for (let i = 0; i < m.w2.length; i++) m.w2[i] = rng.gauss() * INIT_SD;
    if (m.wr) for (let i = 0; i < m.wr.length; i++) m.wr[i] = rng.gauss() * INIT_SD * 0.5;
    return m;
  }

  forward(inp: Float32Array, out: Float32Array): void {
    const { nIn, nHidden, nOut, w1, w2, wr, hidden, prev } = this;
    if (wr) prev.set(hidden);
    for (let j = 0; j < nHidden; j++) {
      let s = 0;
      const o = j * nIn;
      for (let i = 0; i < nIn; i++) s += w1[o + i] * inp[i];
      if (wr) {
        const r = j * nHidden;
        for (let h = 0; h < nHidden; h++) s += wr[r + h] * prev[h];
      }
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

  /** Копия весов; память потомка начинается с нуля. */
  clone(): MLP {
    return new MLP(this.nIn, this.nHidden, this.nOut, this.recurrent, this.w1.slice(), this.w2.slice(), this.wr?.slice());
  }

  mutate(rng: Rng, m: MutationParams): void {
    const apply = (w: Float32Array) => {
      for (let i = 0; i < w.length; i++) {
        const r = rng.next();
        if (r < m.big) w[i] = rng.gauss() * INIT_SD;
        else if (r < m.big + m.rate) w[i] = Math.max(-W_LIMIT, Math.min(W_LIMIT, w[i] + rng.gauss() * m.sigma));
      }
    };
    apply(this.w1);
    apply(this.w2);
    if (this.wr) apply(this.wr);
  }

  toJSON(): BrainJSON {
    const j: BrainJSON = {
      kind: this.kind,
      nIn: this.nIn,
      nHidden: this.nHidden,
      nOut: this.nOut,
      w1: Array.from(this.w1, round),
      w2: Array.from(this.w2, round),
    };
    if (this.wr) j.wr = Array.from(this.wr, round);
    return j;
  }

  static fromJSON(j: BrainJSON): MLP {
    return new MLP(
      j.nIn as number,
      j.nHidden as number,
      j.nOut as number,
      j.kind === 'rnn',
      Float32Array.from(j.w1 as number[]),
      Float32Array.from(j.w2 as number[]),
      j.wr ? Float32Array.from(j.wr as number[]) : null,
    );
  }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
