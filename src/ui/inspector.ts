import type { Bacterium } from '../sim/entities';
import { MLP } from '../sim/brain';
import type { World } from '../sim/world';
import { FP_LABELS, TYPES } from '../sim/behavior';
import { TRAITS } from '../sim/traits';
import { ZONE_TYPES } from '../sim/env';

const fmt = (v: number, d = 1) => v.toFixed(d);

export interface InspectorActions {
  aquarium(b: Bacterium): void;
  focusLineage(id: number): void;
  focusStrategy(name: string): void;
}

/** Окно выбранной бактерии: параметры, черты, поведение и живая схема нейросети. */
export class Inspector {
  private info: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private body: HTMLElement;
  private empty: HTMLElement;
  private current: Bacterium | null = null;

  constructor(
    root: HTMLElement,
    actions: InspectorActions,
    /** компактный режим (для аквариума) — без кнопок */
    compact = false,
  ) {
    root.innerHTML = `<div class="insp-empty">Кликните по бактерии на поле, чтобы увидеть её параметры и нейросеть.</div>
      <div class="insp-body" hidden>
        ${compact ? '' : `<div class="insp-actions"><button data-a="aq">🔬 В аквариум</button><button data-a="lin">Фокус на семью</button><button data-a="str">Фокус на стратегию</button></div>`}
        <div class="insp-info"></div><canvas class="net"></canvas></div>`;
    this.info = root.querySelector('.insp-info')!;
    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.body = root.querySelector('.insp-body')!;
    this.empty = root.querySelector('.insp-empty')!;
    root.querySelector('[data-a=aq]')?.addEventListener('click', () => this.current && actions.aquarium(this.current));
    root.querySelector('[data-a=lin]')?.addEventListener('click', () => this.current && actions.focusLineage(this.current.lineage));
    root.querySelector('[data-a=str]')?.addEventListener('click', () => this.current && actions.focusStrategy(this.current.strategy));
  }

  update(world: World, b: Bacterium | null, alive: boolean): void {
    this.current = b;
    this.body.hidden = !b;
    this.empty.hidden = !!b;
    if (!b) return;
    const t = b.genome.traits;
    const type = TYPES[b.type];
    const main: [string, string][] = [
      ['Состояние', alive ? 'жива' : 'мертва'],
      ['ID / родитель', `#${b.id} / ${b.parentId ? `#${b.parentId}` : 'случайная'}`],
      ['Поколение', `${b.generation}`],
      ['Семья', `№${b.lineage}`],
      ['Возраст', `${b.age} / ${b.maxAge}`],
      ['Энергия', `${fmt(b.energy)} / ${fmt(world.maxEnergyOf(b), 0)}`],
      ['Съедено', `${b.eaten} (до деления ${Math.max(0, Math.max(1, Math.round(t.divFood)) - b.eatenSince)})`],
      ['Потомков', `${b.children}`],
      ['Расход за тик', fmt(world.upkeepOf(b) + world.moveCostOf(b), 3)],
      ['Где', b.zone >= 0 ? `зона «${ZONE_TYPES[b.zone].name}»` : 'обычная местность'],
    ];
    const traits = TRAITS.map((d) => `<div><span>${d.label}</span><b>${d.fmt(t[d.key])}</b></div>`).join('');
    const fp = FP_LABELS.map(
      (f, i) =>
        `<div class="bar"><span>${f.label}</span><i><em style="width:${Math.max(0, Math.min(100, (b.fp[i] / f.max) * 100))}%"></em></i><b>${b.fp[i].toFixed(2)}</b></div>`,
    ).join('');
    this.info.innerHTML =
      `<div class="insp-strategy" style="border-color:${type.color}"><span style="background:${type.color}"></span><div><b>${b.strategy}</b><small>${type.hint}</small></div></div>` +
      `<div class="insp-grid">${main.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
      `<h4>Черты тела (наследуются)</h4><div class="insp-grid">${traits}</div>` +
      `<h4>Поведение (среднее за последние ~60 тиков)</h4><div class="bars">${fp}</div>` +
      `<h4>Нейросеть${b.genome.brain.kind === 'rnn' ? ' (с памятью)' : ''}</h4>`;
    this.drawNet(world, b);
  }

  private drawNet(world: World, b: Bacterium): void {
    const cv = this.canvas;
    const brain = b.genome.brain;
    const nI = brain.nIn;
    const H = Math.max(220, nI * 16 + 30);
    const W = cv.clientWidth || 380;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.height = `${H}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!(brain instanceof MLP)) {
      ctx.fillStyle = '#8b95a5';
      ctx.fillText('Для этого типа мозга нет схемы', 10, 20);
      return;
    }
    const inLabels = world.sensors.flatMap((s) => s.labels);
    const outLabels = world.actuators.map((a) => a.label);
    const nH = brain.nHidden, nO = brain.nOut;
    const xs = [100, W / 2 + 4, W - 96];
    const ys = (n: number) => Array.from({ length: n }, (_, i) => 15 + ((i + 0.5) * (H - 30)) / n);
    const yi = ys(nI), yh = ys(nH), yo = ys(nO);
    const edge = (x1: number, y1: number, x2: number, y2: number, w: number) => {
      const a = Math.min(1, 0.1 + Math.abs(w) * 0.3);
      ctx.strokeStyle = w >= 0 ? `rgba(94,176,239,${a})` : `rgba(239,138,94,${a})`;
      ctx.lineWidth = Math.min(3.5, 0.3 + Math.abs(w) * 0.9);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (let j = 0; j < nH; j++) for (let i = 0; i < nI; i++) edge(xs[0], yi[i], xs[1], yh[j], brain.w1[j * nI + i]);
    for (let k = 0; k < nO; k++) for (let j = 0; j < nH; j++) edge(xs[1], yh[j], xs[2], yo[k], brain.w2[k * (nH + 1) + j]);
    // память: дуга справа от скрытого нейрона, толщина — сила связи с самим собой
    if (brain.wr) {
      for (let j = 0; j < nH; j++) {
        const w = brain.wr[j * nH + j];
        ctx.strokeStyle = w >= 0 ? 'rgba(94,176,239,0.7)' : 'rgba(239,138,94,0.7)';
        ctx.lineWidth = Math.min(3, 0.4 + Math.abs(w));
        ctx.beginPath();
        ctx.arc(xs[1] + 10, yh[j] - 8, 6, Math.PI * 0.7, Math.PI * 2.3);
        ctx.stroke();
      }
    }
    const node = (x: number, y: number, v: number) => {
      const t = Math.max(-1, Math.min(1, v));
      ctx.fillStyle = t >= 0 ? `rgb(${40 + t * 60},${60 + t * 140},${90 + t * 150})` : `rgb(${60 - t * 170},${60 - t * 30},${70 - t * 20})`;
      ctx.strokeStyle = '#c9d1de';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#c9d1de';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let i = 0; i < nI; i++) {
      ctx.fillStyle = '#c9d1de';
      ctx.fillText(inLabels[i] ?? `in${i}`, xs[0] - 10, yi[i]);
      node(xs[0], yi[i], b.inputs[i]);
    }
    for (let j = 0; j < nH; j++) node(xs[1], yh[j], brain.hidden[j]);
    ctx.textAlign = 'left';
    for (let k = 0; k < nO; k++) {
      ctx.fillStyle = '#c9d1de';
      ctx.fillText(`${outLabels[k] ?? `out${k}`} ${fmt(b.outputs[k], 2)}`, xs[2] + 10, yo[k]);
      node(xs[2], yo[k], b.outputs[k]);
    }
  }
}
