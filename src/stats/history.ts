/** История метрик с автоматическим прореживанием: можно смотреть весь запуск. */
export class History {
  times: number[] = [];
  data: Record<string, number[]> = {};

  constructor(
    /** число тиков между точками (удваивается при прореживании) */
    public interval = 50,
    readonly maxPoints = 1500,
  ) {}

  push(tick: number, values: Record<string, number>): void {
    this.times.push(tick);
    for (const k of Object.keys(values)) (this.data[k] ??= new Array(this.times.length - 1).fill(NaN)).push(values[k]);
    if (this.times.length > this.maxPoints) this.decimate();
  }

  /** Склеивает соседние точки попарно (среднее), интервал удваивается. */
  private decimate(): void {
    const n = Math.floor(this.times.length / 2);
    const times: number[] = [];
    for (let i = 0; i < n; i++) times.push(this.times[2 * i + 1]);
    for (const k of Object.keys(this.data)) {
      const a = this.data[k];
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push((a[2 * i] + a[2 * i + 1]) / 2);
      this.data[k] = out;
    }
    this.times = times;
    this.interval *= 2;
  }

  toJSON() {
    return { interval: this.interval, times: this.times, data: this.data };
  }

  static fromJSON(j: { interval: number; times: number[]; data: Record<string, number[]> }): History {
    const h = new History(j.interval);
    h.times = j.times;
    h.data = j.data;
    return h;
  }
}
