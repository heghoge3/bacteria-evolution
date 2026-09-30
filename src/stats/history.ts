/**
 * История метрик в два уровня:
 * - свежие точки хранятся в полном разрешении;
 * - старые сжимаются в «корзины», для каждой хранится среднее, минимум и максимум,
 *   поэтому пики и провалы не пропадают даже через миллионы тиков.
 */

const FINE_MAX = 4000;
const COARSE_MAX = 2000;
const INITIAL_BIN = 8;

type Cols = Record<string, number[]>;

export interface HistoryView {
  t: number[];
  mean: Cols;
  min: Cols;
  max: Cols;
}

export interface HistoryJSON {
  interval: number;
  fineT: number[];
  fine: Cols;
  coarseT: number[];
  cMean: Cols;
  cMin: Cols;
  cMax: Cols;
  bin: number;
}

function agg(a: number[], from: number, to: number): [number, number, number] {
  let s = 0, n = 0, mn = Infinity, mx = -Infinity;
  for (let i = from; i < to; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) continue;
    s += v;
    n++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return n ? [s / n, mn, mx] : [NaN, NaN, NaN];
}

export class History {
  fineT: number[] = [];
  fine: Cols = {};
  coarseT: number[] = [];
  cMean: Cols = {};
  cMin: Cols = {};
  cMax: Cols = {};
  /** сколько тонких точек в одной грубой */
  bin = INITIAL_BIN;
  /** увеличивается при каждом изменении — для кэширования на стороне UI */
  version = 0;
  private cache: HistoryView | null = null;
  private cacheVersion = -1;

  constructor(
    /** число тиков между замерами */
    readonly interval = 50,
  ) {}

  get length(): number {
    return this.fineT.length + this.coarseT.length;
  }

  get lastTime(): number {
    return this.fineT[this.fineT.length - 1] ?? this.coarseT[this.coarseT.length - 1] ?? 0;
  }

  get firstTime(): number {
    return this.coarseT[0] ?? this.fineT[0] ?? 0;
  }

  last(id: string): number {
    const a = this.fine[id];
    return a?.[a.length - 1] ?? NaN;
  }

  push(tick: number, values: Record<string, number>): void {
    const n = this.fineT.length;
    this.fineT.push(tick);
    for (const k of Object.keys(values)) {
      if (!this.fine[k]) {
        this.fine[k] = new Array(n).fill(NaN);
        const cn = this.coarseT.length;
        this.cMean[k] = new Array(cn).fill(NaN);
        this.cMin[k] = new Array(cn).fill(NaN);
        this.cMax[k] = new Array(cn).fill(NaN);
      }
      this.fine[k].push(values[k]);
    }
    for (const k of Object.keys(this.fine)) if (this.fine[k].length < n + 1) this.fine[k].push(NaN);
    if (this.fineT.length > FINE_MAX) this.compress();
    this.version++;
  }

  /** Переносит самые старые тонкие точки в одну грубую. */
  private compress(): void {
    const b = this.bin;
    this.coarseT.push(this.fineT[Math.floor(b / 2)]);
    this.fineT.splice(0, b);
    for (const k of Object.keys(this.fine)) {
      const [m, mn, mx] = agg(this.fine[k], 0, b);
      this.fine[k].splice(0, b);
      this.cMean[k].push(m);
      this.cMin[k].push(mn);
      this.cMax[k].push(mx);
    }
    if (this.coarseT.length > COARSE_MAX) this.mergeCoarse();
  }

  private mergeCoarse(): void {
    const n = Math.floor(this.coarseT.length / 2);
    const t: number[] = [];
    for (let i = 0; i < n; i++) t.push(this.coarseT[2 * i]);
    const rest = this.coarseT.length % 2 ? [this.coarseT[this.coarseT.length - 1]] : [];
    this.coarseT = [...t, ...rest];
    for (const k of Object.keys(this.cMean)) {
      const m = this.cMean[k], mn = this.cMin[k], mx = this.cMax[k];
      const nm: number[] = [], nmn: number[] = [], nmx: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = m[2 * i], b = m[2 * i + 1];
        nm.push(Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b);
        nmn.push(Math.min(mn[2 * i], mn[2 * i + 1]));
        nmx.push(Math.max(mx[2 * i], mx[2 * i + 1]));
      }
      if (rest.length) {
        nm.push(m[m.length - 1]);
        nmn.push(mn[mn.length - 1]);
        nmx.push(mx[mx.length - 1]);
      }
      this.cMean[k] = nm;
      this.cMin[k] = nmn.map((v) => (Number.isFinite(v) ? v : NaN));
      this.cMax[k] = nmx.map((v) => (Number.isFinite(v) ? v : NaN));
    }
    this.bin *= 2;
  }

  /** Вся история одним куском: сначала грубые точки, затем тонкие. */
  view(): HistoryView {
    if (this.cache && this.cacheVersion === this.version) return this.cache;
    const mean: Cols = {}, min: Cols = {}, max: Cols = {};
    for (const k of Object.keys(this.fine)) {
      const f = this.fine[k];
      mean[k] = (this.cMean[k] ?? []).concat(f);
      min[k] = (this.cMin[k] ?? []).concat(f);
      max[k] = (this.cMax[k] ?? []).concat(f);
    }
    this.cache = { t: this.coarseT.concat(this.fineT), mean, min, max };
    this.cacheVersion = this.version;
    return this.cache;
  }

  toJSON(): HistoryJSON {
    const r = (c: Cols) => {
      const o: Cols = {};
      for (const k of Object.keys(c)) o[k] = c[k].map((v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null) as number);
      return o;
    };
    return {
      interval: this.interval, fineT: this.fineT, fine: r(this.fine), coarseT: this.coarseT,
      cMean: r(this.cMean), cMin: r(this.cMin), cMax: r(this.cMax), bin: this.bin,
    };
  }

  static fromJSON(j: HistoryJSON): History {
    const fix = (c: Cols) => {
      const o: Cols = {};
      for (const k of Object.keys(c ?? {})) o[k] = c[k].map((v) => (v === null ? NaN : v));
      return o;
    };
    const h = new History(j.interval);
    h.fineT = j.fineT;
    h.fine = fix(j.fine);
    h.coarseT = j.coarseT ?? [];
    h.cMean = fix(j.cMean);
    h.cMin = fix(j.cMin);
    h.cMax = fix(j.cMax);
    h.bin = j.bin ?? INITIAL_BIN;
    for (const k of Object.keys(h.fine)) {
      const cn = h.coarseT.length;
      for (const c of [h.cMean, h.cMin, h.cMax]) if (!c[k]) c[k] = new Array(cn).fill(NaN);
    }
    return h;
  }

  /** Старый формат (v1): {interval, times, data} → всё в тонкие точки. */
  static fromLegacy(j: { interval: number; times: number[]; data: Cols }): History {
    const h = new History(50);
    j.times.forEach((t, i) => {
      const v: Record<string, number> = {};
      for (const k of Object.keys(j.data)) v[k] = j.data[k][i] ?? NaN;
      h.push(t, v);
    });
    return h;
  }
}

/** История распределений (для тепловых карт): столбец = доли по корзинам значений. */
export class HeatHistory {
  times: number[] = [];
  data: Record<string, number[][]> = {};
  version = 0;

  constructor(readonly maxColumns = 1200) {}

  push(tick: number, cols: Record<string, number[]>): void {
    const n = this.times.length;
    this.times.push(tick);
    for (const k of Object.keys(cols)) {
      if (!this.data[k]) this.data[k] = new Array(n).fill([]);
      this.data[k].push(cols[k]);
    }
    for (const k of Object.keys(this.data)) if (this.data[k].length < n + 1) this.data[k].push([]);
    if (this.times.length > this.maxColumns) this.merge();
    this.version++;
  }

  private merge(): void {
    const n = Math.floor(this.times.length / 2);
    this.times = Array.from({ length: n }, (_, i) => this.times[2 * i]);
    for (const k of Object.keys(this.data)) {
      const d = this.data[k];
      this.data[k] = Array.from({ length: n }, (_, i) => {
        const a = d[2 * i], b = d[2 * i + 1];
        if (!a.length) return b;
        if (!b.length) return a;
        return a.map((v, j) => Math.round(((v + b[j]) / 2) * 1000) / 1000);
      });
    }
  }

  toJSON() {
    return { times: this.times, data: this.data };
  }

  static fromJSON(j: { times: number[]; data: Record<string, number[][]> } | undefined): HeatHistory {
    const h = new HeatHistory();
    if (j) {
      h.times = j.times;
      h.data = j.data;
    }
    return h;
  }
}
