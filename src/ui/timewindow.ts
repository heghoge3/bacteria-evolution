/**
 * Общее «окно времени» для всех графиков, тепловых карт и долей стратегий:
 * последние N тиков, весь запуск или выбранный мышью участок.
 */
export type WindowMode = number | 'all' | 'custom';

export class TimeWindow {
  mode: WindowMode = 20000;
  /** последний выбранный кнопкой режим — к нему возвращает двойной клик */
  preset: number | 'all' = 20000;
  min = 0;
  max = 0;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    for (const f of this.listeners) f();
  }

  setPreset(m: number | 'all'): void {
    this.mode = m;
    this.preset = m;
    this.emit();
  }

  setCustom(min: number, max: number): void {
    if (max - min < 1) return;
    this.mode = 'custom';
    this.min = min;
    this.max = max;
    this.emit();
  }

  reset(): void {
    this.setPreset(this.preset);
  }

  /** Диапазон по оси времени для данных, лежащих в [first, last]. */
  range(first: number, last: number): [number, number] {
    if (this.mode === 'custom') return [this.min, this.max];
    if (this.mode === 'all') return [first, Math.max(last, first + 1)];
    return [Math.max(first, last - this.mode), Math.max(last, first + 1)];
  }

  /** Зум вокруг точки t: factor < 1 — приблизить. */
  zoom(t: number, factor: number, first: number, last: number): void {
    const [a, b] = this.range(first, last);
    const na = t - (t - a) * factor;
    const nb = t + (b - t) * factor;
    this.setCustom(Math.max(first, na), Math.min(Math.max(last, first + 1), nb));
  }

  pan(frac: number, first: number, last: number): void {
    const [a, b] = this.range(first, last);
    let d = (b - a) * frac;
    if (a + d < first) d = first - a;
    if (b + d > last) d = last - b;
    this.setCustom(a + d, b + d);
  }
}
