export interface Spatial {
  x: number;
  y: number;
  /** служебные поля сетки */
  cell: number;
  slot: number;
}

/** Равномерная сетка для быстрого поиска ближайшего объекта. */
export class Grid<T extends Spatial> {
  private cols: number;
  private rows: number;
  private cells: T[][];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  private cx(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }
  private cy(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  add(o: T): void {
    const ci = this.cy(o.y) * this.cols + this.cx(o.x);
    const arr = this.cells[ci];
    o.cell = ci;
    o.slot = arr.length;
    arr.push(o);
  }

  remove(o: T): void {
    const arr = this.cells[o.cell];
    const last = arr.pop()!;
    if (last !== o) {
      arr[o.slot] = last;
      last.slot = o.slot;
    }
  }

  /** Ближайший объект в радиусе r (или null). */
  nearest(x: number, y: number, r: number): T | null {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    let best: T | null = null;
    let bd = r * r;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const arr = this.cells[j * this.cols + i];
        for (let k = 0; k < arr.length; k++) {
          const o = arr[k];
          const dx = o.x - x, dy = o.y - y;
          const d = dx * dx + dy * dy;
          if (d <= bd) {
            bd = d;
            best = o;
          }
        }
      }
    }
    return best;
  }

  /** Вызывает fn для каждого объекта в квадрате вокруг точки (фильтр по кругу — на вызывающем). */
  /** Складывает в out массивы ячеек вокруг точки (быстрее, чем обход с колбэком). */
  cellsNear(x: number, y: number, r: number, out: T[][]): number {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    let n = 0;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) out[n++] = this.cells[j * this.cols + i];
    return n;
  }

  forEachNear(x: number, y: number, r: number, fn: (o: T) => void): void {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const arr = this.cells[j * this.cols + i];
        for (let k = 0; k < arr.length; k++) fn(arr[k]);
      }
    }
  }
}

/** Сетка, которая целиком перестраивается каждый тик (для движущихся объектов). */
export class BucketGrid<T extends { x: number; y: number }> {
  private cols: number;
  private rows: number;
  private cells: T[][];

  constructor(width: number, height: number, readonly cellSize: number) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  private cx(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }
  private cy(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  rebuild(items: readonly T[]): void {
    for (const c of this.cells) c.length = 0;
    for (const o of items) this.cells[this.cy(o.y) * this.cols + this.cx(o.x)].push(o);
  }

  /** Складывает в out массивы ячеек вокруг точки (быстрее, чем обход с колбэком). */
  cellsNear(x: number, y: number, r: number, out: T[][]): number {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    let n = 0;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) out[n++] = this.cells[j * this.cols + i];
    return n;
  }

  forEachNear(x: number, y: number, r: number, fn: (o: T) => void): void {
    const x0 = this.cx(x - r), x1 = this.cx(x + r);
    const y0 = this.cy(y - r), y1 = this.cy(y + r);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const arr = this.cells[j * this.cols + i];
        for (let k = 0; k < arr.length; k++) fn(arr[k]);
      }
    }
  }
}
