import type { HeatHistory, History } from '../stats/history';
import { HEATS, HEAT_BINS, type HeatDef } from '../stats/heat';
import { TYPES } from '../sim/behavior';
import type { TimeWindow } from './timewindow';

/** Цветовая шкала: тёмный → бирюзовый → жёлтый. */
function colormap(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0, 18, 24, 36],
    [0.25, 30, 70, 110],
    [0.55, 40, 160, 160],
    [0.8, 150, 210, 110],
    [1, 250, 230, 120],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  return [250, 230, 120];
}

const fmtT = (v: number) => Math.round(v).toLocaleString('ru-RU');

function sizeCanvas(cv: HTMLCanvasElement, h: number): [CanvasRenderingContext2D, number, number] {
  const w = cv.clientWidth || 400;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = `${h}px`;
  }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, w, h];
}

const PAD_L = 44;
const PAD_B = 16;

/** Колонки истории, попадающие в окно [a, b]: индексы и координаты по X. */
function columns(times: number[], a: number, b: number, x0: number, w: number): { i: number; x: number; x2: number }[] {
  const out: { i: number; x: number; x2: number }[] = [];
  const sx = (t: number) => x0 + ((t - a) / (b - a)) * w;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const next = times[i + 1] ?? t + (times[i] - (times[i - 1] ?? t - 50));
    if (next < a || t > b) continue;
    out.push({ i, x: Math.max(x0, sx(t)), x2: Math.min(x0 + w, sx(next)) });
  }
  return out;
}

function drawTimeAxis(ctx: CanvasRenderingContext2D, a: number, b: number, x0: number, w: number, y: number): void {
  ctx.fillStyle = '#8b95a5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (let k = 0; k <= 4; k++) {
    const t = a + ((b - a) * k) / 4;
    ctx.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center';
    ctx.fillText(fmtT(t), x0 + (w * k) / 4, y + 3);
  }
}

/** Тепловые карты распределений: видно, как популяция расслаивается на группы. */
export class HeatPanel {
  private items: { def: HeatDef; cv: HTMLCanvasElement; info: HTMLElement }[] = [];
  private off = document.createElement('canvas');
  private heat: HeatHistory | null = null;
  private hist: History | null = null;

  constructor(
    root: HTMLElement,
    private win: TimeWindow,
  ) {
    root.innerHTML = `<p class="hint">Каждая карта — распределение популяции во времени. По горизонтали — тики (то же окно, что на графиках),
      по вертикали — значение, яркость — сколько бактерий имеют такое значение. <b>Две яркие полосы — популяция разделилась на две стратегии.</b>
      Полоса сместилась — отбор изменил поведение или тело.</p>`;
    let group = '';
    for (const def of HEATS) {
      if (def.group !== group) {
        group = def.group;
        const h = document.createElement('h3');
        h.className = 'group-title';
        h.textContent = group;
        root.appendChild(h);
      }
      const box = document.createElement('section');
      box.className = 'heat';
      box.innerHTML = `<header><h4>${def.label}</h4><span class="heat-info"></span></header><canvas></canvas>`;
      root.appendChild(box);
      const cv = box.querySelector('canvas')!;
      const info = box.querySelector<HTMLElement>('.heat-info')!;
      this.items.push({ def, cv, info });
      cv.addEventListener('mousemove', (e) => this.hover(def, cv, info, e.offsetX, e.offsetY));
      cv.addEventListener('mouseleave', () => (info.textContent = ''));
    }
    this.off.height = HEAT_BINS;
    win.onChange(() => this.draw());
  }

  update(heat: HeatHistory, hist: History): void {
    this.heat = heat;
    this.hist = hist;
    this.draw();
  }

  private range(): [number, number] {
    const h = this.hist!;
    return this.win.range(h.firstTime, h.lastTime);
  }

  draw(): void {
    if (!this.heat || !this.hist) return;
    const [a, b] = this.range();
    for (const it of this.items) this.drawOne(it.def, it.cv, a, b);
  }

  private drawOne(def: HeatDef, cv: HTMLCanvasElement, a: number, b: number): void {
    const H = 92;
    const [ctx, W] = sizeCanvas(cv, H);
    const pw = W - PAD_L;
    const ph = H - PAD_B;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(PAD_L, 0, pw, ph);
    const data = this.heat!.data[def.id];
    if (!data) return;
    const cols = columns(this.heat!.times, a, b, PAD_L, pw);
    // рисуем в маленький буфер (1 пиксель = 1 столбец × 1 корзина), затем растягиваем
    const bw = Math.max(1, Math.round(pw));
    this.off.width = bw;
    const octx = this.off.getContext('2d')!;
    const img = octx.createImageData(bw, HEAT_BINS);
    for (const c of cols) {
      const col = data[c.i];
      if (!col || !col.length) continue;
      let mx = 0;
      for (const v of col) if (v > mx) mx = v;
      if (mx <= 0) continue;
      const px0 = Math.max(0, Math.floor(c.x - PAD_L));
      const px1 = Math.min(bw, Math.max(px0 + 1, Math.ceil(c.x2 - PAD_L)));
      for (let bin = 0; bin < HEAT_BINS; bin++) {
        const v = col[bin] / mx;
        if (v <= 0) continue;
        const [r, g, bl] = colormap(Math.sqrt(v));
        const row = HEAT_BINS - 1 - bin;
        for (let px = px0; px < px1; px++) {
          const o = (row * bw + px) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = bl;
          img.data[o + 3] = 255;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, bw, HEAT_BINS, PAD_L, 0, pw, ph);
    // ось значений
    ctx.fillStyle = '#8b95a5';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(def.fmt(def.max), PAD_L - 4, 0);
    ctx.textBaseline = 'middle';
    ctx.fillText(def.fmt((def.min + def.max) / 2), PAD_L - 4, ph / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(def.fmt(def.min), PAD_L - 4, ph);
    drawTimeAxis(ctx, a, b, PAD_L, pw, ph);
  }

  private hover(def: HeatDef, cv: HTMLCanvasElement, info: HTMLElement, x: number, y: number): void {
    if (!this.heat || !this.hist) return;
    const [a, b] = this.range();
    const W = cv.clientWidth;
    const ph = 92 - PAD_B;
    if (x < PAD_L || y > ph) return;
    const t = a + ((x - PAD_L) / (W - PAD_L)) * (b - a);
    const times = this.heat.times;
    let i = 0;
    while (i < times.length - 1 && times[i + 1] <= t) i++;
    const col = this.heat.data[def.id]?.[i];
    if (!col?.length) return;
    const bin = Math.min(HEAT_BINS - 1, Math.max(0, Math.floor(((ph - y) / ph) * HEAT_BINS)));
    const lo = def.min + ((def.max - def.min) * bin) / HEAT_BINS;
    const hi = lo + (def.max - def.min) / HEAT_BINS;
    info.textContent = `тик ${fmtT(times[i])}: ${def.fmt(lo)}…${def.fmt(hi)} — ${Math.round(col[bin] * 100)} % популяции`;
  }
}

/** Доли типов поведения во времени (накопленные области). */
export class TypeAreaChart {
  private hist: History | null = null;

  constructor(
    private cv: HTMLCanvasElement,
    private info: HTMLElement,
    private win: TimeWindow,
  ) {
    win.onChange(() => this.draw());
    cv.addEventListener('mousemove', (e) => this.hover(e.offsetX));
    cv.addEventListener('mouseleave', () => (this.info.textContent = ''));
  }

  update(h: History): void {
    this.hist = h;
    this.draw();
  }

  draw(): void {
    const h = this.hist;
    if (!h) return;
    const H = 150;
    const [ctx, W] = sizeCanvas(this.cv, H);
    const pw = W - PAD_L, ph = H - PAD_B;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(PAD_L, 0, pw, ph);
    const v = h.view();
    const [a, b] = this.win.range(h.firstTime, h.lastTime);
    const idx: number[] = [];
    for (let i = 0; i < v.t.length; i++) if (v.t[i] >= a && v.t[i] <= b) idx.push(i);
    if (idx.length > 1) {
      const sx = (t: number) => PAD_L + ((t - a) / (b - a)) * pw;
      const acc = idx.map(() => 0);
      TYPES.forEach((type, k) => {
        const col = v.mean[`type${k}`] ?? [];
        ctx.fillStyle = type.color;
        ctx.beginPath();
        idx.forEach((i, j) => {
          const y = ph - (acc[j] + (Number.isFinite(col[i]) ? col[i] : 0)) * ph;
          if (j === 0) ctx.moveTo(sx(v.t[i]), y);
          else ctx.lineTo(sx(v.t[i]), y);
        });
        for (let j = idx.length - 1; j >= 0; j--) ctx.lineTo(sx(v.t[idx[j]]), ph - acc[j] * ph);
        ctx.closePath();
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        idx.forEach((i, j) => (acc[j] += Number.isFinite(col[i]) ? col[i] : 0));
      });
    }
    ctx.fillStyle = '#8b95a5';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('100%', PAD_L - 4, 0);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0%', PAD_L - 4, ph);
    drawTimeAxis(ctx, a, b, PAD_L, pw, ph);
  }

  private hover(x: number): void {
    const h = this.hist;
    if (!h || x < PAD_L) return;
    const v = h.view();
    const [a, b] = this.win.range(h.firstTime, h.lastTime);
    const t = a + ((x - PAD_L) / (this.cv.clientWidth - PAD_L)) * (b - a);
    let i = 0;
    while (i < v.t.length - 1 && v.t[i + 1] <= t) i++;
    this.info.innerHTML =
      `тик ${fmtT(v.t[i] ?? 0)}: ` +
      TYPES.map((ty, k) => `<span style="color:${ty.color}">${ty.name} ${Math.round((v.mean[`type${k}`]?.[i] ?? 0) * 100)}%</span>`).join(' · ');
  }
}
