import type { Bacterium } from '../sim/entities';
import { MLP } from '../sim/brain';
import type { World } from '../sim/world';

const fmt = (v: number, d = 1) => v.toFixed(d);

/** Окно выбранной бактерии: параметры и живая схема нейросети. */
export class Inspector {
  private info: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(root: HTMLElement) {
    root.innerHTML = `<div class="insp-empty">Кликните по бактерии на поле, чтобы увидеть её параметры и нейросеть.</div>
      <div class="insp-body" hidden><div class="insp-info"></div><canvas class="net"></canvas></div>`;
    this.info = root.querySelector('.insp-info')!;
    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private root() {
    return this.info.parentElement!.parentElement!;
  }

  update(world: World, b: Bacterium | null, alive: boolean): void {
    const root = this.root();
    const body = root.querySelector<HTMLElement>('.insp-body')!;
    const empty = root.querySelector<HTMLElement>('.insp-empty')!;
    body.hidden = !b;
    empty.hidden = !!b;
    if (!b) return;
    const rows: [string, string][] = [
      ['Состояние', alive ? 'жива' : 'мертва'],
      ['ID', `#${b.id}`],
      ['Родитель', b.parentId ? `#${b.parentId}` : '— (случайная)'],
      ['Поколение', `${b.generation}`],
      ['Семья', `№${b.lineage}`],
      ['Возраст', `${b.age} / ${b.maxAge}`],
      ['Энергия', `${fmt(b.energy)} / ${world.cfg.maxEnergy}`],
      ['Съедено', `${b.eaten} (до деления: ${Math.max(0, world.cfg.divideFood - b.eatenSince)})`],
      ['Потомков', `${b.children}`],
      ['Тяга', fmt(b.thrust, 2)],
      ['Видит еду', b.seesFood ? `да, ${fmt(b.foodDist, 0)} ед.` : 'нет'],
    ];
    this.info.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.drawNet(world, b);
  }

  private drawNet(world: World, b: Bacterium): void {
    const cv = this.canvas;
    const W = cv.clientWidth || 380;
    const H = 300;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.height = `${H}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const brain = b.genome.brain;
    if (!(brain instanceof MLP)) {
      ctx.fillStyle = '#8b95a5';
      ctx.fillText('Для этого типа мозга нет схемы', 10, 20);
      return;
    }
    const inLabels = world.sensors.flatMap((s) => s.labels);
    const outLabels = world.actuators.map((a) => a.label);
    const nI = brain.nIn, nH = brain.nHidden, nO = brain.nOut;
    const xs = [112, W / 2 + 6, W - 104];
    const ys = (n: number) => Array.from({ length: n }, (_, i) => 20 + ((i + 0.5) * (H - 40)) / n);
    const yi = ys(nI), yh = ys(nH), yo = ys(nO);
    const edge = (x1: number, y1: number, x2: number, y2: number, w: number) => {
      ctx.strokeStyle = w >= 0 ? `rgba(94,176,239,${Math.min(1, 0.15 + Math.abs(w) * 0.35)})` : `rgba(239,138,94,${Math.min(1, 0.15 + Math.abs(w) * 0.35)})`;
      ctx.lineWidth = Math.min(4, 0.4 + Math.abs(w) * 1.1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (let j = 0; j < nH; j++) for (let i = 0; i < nI; i++) edge(xs[0], yi[i], xs[1], yh[j], brain.w1[j * nI + i]);
    for (let k = 0; k < nO; k++) for (let j = 0; j < nH; j++) edge(xs[1], yh[j], xs[2], yo[k], brain.w2[k * (nH + 1) + j]);
    const node = (x: number, y: number, v: number) => {
      const t = Math.max(-1, Math.min(1, v));
      ctx.fillStyle = t >= 0 ? `rgb(${40 + t * 60},${60 + t * 140},${90 + t * 150})` : `rgb(${60 - t * 170},${60 - t * 30},${70 - t * 20})`;
      ctx.strokeStyle = '#c9d1de';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#c9d1de';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let i = 0; i < nI; i++) {
      ctx.fillText(inLabels[i] ?? `in${i}`, xs[0] - 12, yi[i]);
      node(xs[0], yi[i], b.inputs[i]);
    }
    for (let j = 0; j < nH; j++) node(xs[1], yh[j], brain.hidden[j]);
    ctx.textAlign = 'left';
    for (let k = 0; k < nO; k++) {
      ctx.fillText(`${outLabels[k] ?? `out${k}`} ${fmt(b.outputs[k], 2)}`, xs[2] + 12, yo[k]);
      node(xs[2], yo[k], b.outputs[k]);
    }
  }
}
