import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { History } from '../stats/history';
import type { Marker } from '../stats/recorder';
import { TYPES } from '../sim/behavior';
import type { TimeWindow } from './timewindow';

export interface ChartDef {
  id: string;
  title: string;
  hint?: string;
  series: { metric: string; label: string; color: string; points?: boolean }[];
  /** затенять зимы (по метрике season) */
  seasons?: boolean;
}

const C = { blue: '#5eb0ef', orange: '#ef8a5e', green: '#7ad08a', yellow: '#e0c15a', purple: '#b58cf0', pink: '#ef6f9b', cyan: '#4fd1c5', grey: '#a3acb9' };

/** Список графиков. Новая метрика в stats/metrics.ts + запись здесь = новый график. */
export const CHARTS: ChartDef[] = [
  {
    id: 'pop', title: 'Популяция и еда', seasons: true, hint: 'Голубой фон — зима (еды появляется меньше)',
    series: [
      { metric: 'pop', label: 'Бактерий', color: C.blue },
      { metric: 'food', label: 'Еды на поле', color: C.green },
    ],
  },
  {
    id: 'flow', title: 'Рождения и смерти (за 100 тиков)', seasons: true,
    series: [
      { metric: 'births', label: 'Рождения', color: C.green },
      { metric: 'deathsHunger', label: 'Голод', color: C.orange },
      { metric: 'deathsAge', label: 'Старость', color: C.purple },
    ],
  },
  {
    id: 'dir', title: 'Направленность на еду',
    hint: '≈0 — движутся без цели, →1 — едут прямо к еде',
    series: [{ metric: 'directionality', label: 'cos угла к еде', color: C.yellow }],
  },
  {
    id: 'eff', title: 'Еды на бактерию за 1000 тиков', seasons: true,
    series: [{ metric: 'efficiency', label: 'Эффективность', color: C.green }],
  },
  {
    id: 'exam', title: 'Экзамен лучших (еды за 2000 тиков в одиночку)',
    hint: 'Лучшие бактерии проходят один и тот же тестовый мир. Не зависит от численности и зимы.',
    series: [
      { metric: 'exam', label: 'Среднее', color: C.cyan, points: true },
      { metric: 'examBest', label: 'Лучший', color: C.pink, points: true },
    ],
  },
  {
    id: 'traits', title: 'Черты тела (средние)',
    hint: '1.0 — исходное значение. Рост — отбор выгоден, падение — черта слишком дорогая.',
    series: [
      { metric: 'trait_size', label: 'Размер', color: C.orange },
      { metric: 'trait_speed', label: 'Скорость', color: C.blue },
      { metric: 'trait_vision', label: 'Зрение', color: C.green },
      { metric: 'trait_lifespan', label: 'Долголетие', color: C.purple },
    ],
  },
  {
    id: 'repro', title: 'Стратегия размножения',
    series: [
      { metric: 'trait_divFood', label: 'Еды до деления', color: C.yellow },
      { metric: 'trait_childShare', label: 'Доля энергии потомку', color: C.pink },
    ],
  },
  {
    id: 'move', title: 'Движение',
    series: [
      { metric: 'avgSpeed', label: 'Скорость (поведение)', color: C.blue },
      { metric: 'avgThrust', label: 'Тяга 0…1', color: C.grey },
    ],
  },
  {
    id: 'types', title: 'Доли типов поведения',
    series: TYPES.map((t, i) => ({ metric: `type${i}`, label: t.name, color: t.color })),
  },
  {
    id: 'strategies', title: 'Число заметных стратегий (≥ 5 %)',
    series: [{ metric: 'strategies', label: 'Стратегий', color: C.cyan }],
  },
  {
    id: 'gen', title: 'Поколения',
    series: [
      { metric: 'avgGen', label: 'Среднее', color: C.blue },
      { metric: 'maxGen', label: 'Максимальное', color: C.pink },
    ],
  },
  {
    id: 'energy', title: 'Средняя энергия', seasons: true,
    series: [{ metric: 'avgEnergy', label: 'Энергия', color: C.orange }],
  },
  {
    id: 'life', title: 'Средняя продолжительность жизни (тиков)',
    series: [{ metric: 'avgLifespan', label: 'Возраст при смерти', color: C.purple }],
  },
  {
    id: 'lin', title: 'Доли пяти крупнейших семей',
    series: [
      { metric: 'lin1', label: '№1', color: C.blue },
      { metric: 'lin2', label: '№2', color: C.orange },
      { metric: 'lin3', label: '№3', color: C.green },
      { metric: 'lin4', label: '№4', color: C.yellow },
      { metric: 'lin5', label: '№5', color: C.purple },
    ],
  },
];

export const MARKER_COLORS: Record<Marker['kind'], string> = {
  config: '#5eb0ef',
  scenario: '#e0c15a',
  strategy: 'rgba(122,208,138,0.55)',
  lineage: 'rgba(181,140,240,0.6)',
  extinct: '#ef6f6f',
  epoch: '#ef8a5e',
};

const AXIS = { stroke: '#8b95a5', grid: { stroke: '#232b3a', width: 1 }, ticks: { stroke: '#232b3a', width: 1 } };
const HEIGHT = 170;

function smooth(a: number[], k: number): number[] {
  if (k <= 1) return a;
  const out = new Array(a.length);
  const h = Math.floor(k / 2);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) {
      const v = a[j];
      if (Number.isFinite(v)) {
        s += v;
        n++;
      }
    }
    out[i] = n ? s / n : NaN;
  }
  return out;
}

const fmtTick = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));

interface PlotCtx {
  def: ChartDef;
  plot: uPlot;
  box: HTMLElement;
  holder: HTMLElement;
  tip: HTMLElement;
  bands: { min: number[]; max: number[] }[];
  season: number[];
}

export class ChartPanel {
  private plots: PlotCtx[] = [];
  private width = 0;
  private internal = false;
  private smoothK = 1;
  private asinh = false;
  private history: History | null = null;
  private markers: Marker[] = [];
  private lastVersion = -1;
  private full: PlotCtx | null = null;
  private grid: HTMLElement;

  constructor(
    private root: HTMLElement,
    private win: TimeWindow,
  ) {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.innerHTML = `
      <div class="seg" data-role="win">
        <button data-win="2000">2k</button><button data-win="20000">20k</button><button data-win="200000">200k</button><button data-win="all">Всё</button>
      </div>
      <label>Сглаживание <select data-role="smooth"><option value="1">нет</option><option value="5">×5</option><option value="21">×21</option><option value="81">×81</option></select></label>
      <label class="check"><input type="checkbox" data-role="asinh"/> сжатая шкала</label>
      <p class="hint">Выделите участок мышью — приблизить. Колесо — зум, Shift+колесо — сдвиг, двойной клик — вернуть окно. Полоса вокруг линии — разброс (мин…макс) в сжатой старой истории.</p>`;
    root.appendChild(bar);
    bar.querySelectorAll<HTMLButtonElement>('[data-win]').forEach((b) =>
      b.addEventListener('click', () => win.setPreset(b.dataset.win === 'all' ? 'all' : Number(b.dataset.win))),
    );
    bar.querySelector<HTMLSelectElement>('[data-role=smooth]')!.addEventListener('change', (e) => {
      this.smoothK = Number((e.target as HTMLSelectElement).value);
      this.lastVersion = -1;
      this.refresh();
    });
    bar.querySelector<HTMLInputElement>('[data-role=asinh]')!.addEventListener('change', (e) => {
      this.asinh = (e.target as HTMLInputElement).checked;
      this.destroy();
      this.layout();
      this.lastVersion = -1;
      this.refresh();
    });
    this.grid = document.createElement('div');
    root.appendChild(this.grid);
    win.onChange(() => {
      this.syncButtons();
      this.applyRange();
    });
    this.syncButtons();
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.full && this.toggleFull(this.full));
  }

  private syncButtons(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-win]').forEach((b) => {
      const v = b.dataset.win === 'all' ? 'all' : Number(b.dataset.win);
      b.classList.toggle('active', this.win.mode === v);
    });
  }

  private destroy(): void {
    for (const p of this.plots) p.plot.destroy();
    this.plots = [];
    this.grid.innerHTML = '';
    this.width = 0;
  }

  /** Создаёт/масштабирует графики; вызывать, когда вкладка видна. */
  layout(): void {
    const w = Math.floor(this.root.clientWidth - 2);
    if (w < 100) return;
    if (!this.plots.length) {
      for (const def of CHARTS) this.plots.push(this.create(def, w));
      this.width = w;
      this.lastVersion = -1;
      return;
    }
    if (w !== this.width) {
      for (const p of this.plots) if (p !== this.full) p.plot.setSize({ width: w, height: HEIGHT });
      this.width = w;
    }
  }

  private create(def: ChartDef, width: number): PlotCtx {
    const box = document.createElement('section');
    box.className = 'chart';
    box.innerHTML = `<header><h3>${def.title}</h3><button class="icon" title="Во весь экран (Esc — назад)">⤢</button></header>${
      def.hint ? `<p class="hint">${def.hint}</p>` : ''
    }<div class="plot"></div><div class="marker-tip" hidden></div>`;
    this.grid.appendChild(box);
    const holder = box.querySelector<HTMLElement>('.plot')!;
    const tip = box.querySelector<HTMLElement>('.marker-tip')!;
    const ctx = { def, box, holder, tip, bands: def.series.map(() => ({ min: [], max: [] })), season: [] } as unknown as PlotCtx;
    const self = this;
    ctx.plot = new uPlot(
      {
        width,
        height: HEIGHT,
        scales: { x: { time: false }, y: this.asinh ? { distr: 4, asinh: 1 } : {} },
        cursor: { drag: { x: true, y: false, setScale: true }, sync: { key: 'bact', setSeries: false } },
        axes: [{ ...AXIS, size: 26, values: (_u, vals) => vals.map(fmtTick) }, { ...AXIS, size: 48 }],
        legend: { live: true },
        series: [
          { label: 'тик', value: (_u, v) => (v == null ? '—' : Math.round(v).toLocaleString('ru-RU')) },
          ...def.series.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: 1.6,
            spanGaps: true,
            points: s.points ? { show: true, size: 5, fill: s.color } : { show: false },
            value: (_u: uPlot, v: number | null) => (v == null ? '—' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('ru-RU') : v.toFixed(2)),
          })),
        ],
        hooks: {
          drawAxes: [(u) => self.drawUnder(u, ctx)],
          draw: [(u) => self.drawMarkers(u)],
          setScale: [
            (u, key) => {
              if (key !== 'x' || self.internal) return;
              const { min, max } = u.scales.x;
              if (min != null && max != null) self.win.setCustom(min, max);
            },
          ],
          setCursor: [(u) => self.markerTip(u, ctx)],
          ready: [
            (u) => {
              u.over.addEventListener('dblclick', () => self.win.reset());
              u.over.addEventListener('mouseleave', () => (ctx.tip.hidden = true));
              u.over.addEventListener(
                'wheel',
                (e) => {
                  if (!self.history) return;
                  e.preventDefault();
                  const h = self.history;
                  const first = h.firstTime, last = h.lastTime;
                  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                    self.win.pan(((e.shiftKey ? e.deltaY : e.deltaX) > 0 ? 1 : -1) * 0.15, first, last);
                  } else {
                    const t = u.posToVal(e.offsetX, 'x');
                    self.win.zoom(t, e.deltaY < 0 ? 0.8 : 1.25, first, last);
                  }
                },
                { passive: false },
              );
            },
          ],
        },
      },
      [[], ...def.series.map(() => [])],
      holder,
    );
    box.querySelector('button.icon')!.addEventListener('click', () => this.toggleFull(ctx));
    return ctx;
  }

  private toggleFull(ctx: PlotCtx): void {
    const on = this.full !== ctx;
    if (this.full) {
      this.full.box.classList.remove('full');
      this.full.plot.setSize({ width: this.width, height: HEIGHT });
      this.full = null;
    }
    if (on) {
      ctx.box.classList.add('full');
      this.full = ctx;
      requestAnimationFrame(() => ctx.plot.setSize({ width: ctx.box.clientWidth - 24, height: ctx.box.clientHeight - 90 }));
    }
  }

  /** Полосы разброса и зимы — под линиями. */
  private drawUnder(u: uPlot, ctx: PlotCtx): void {
    const c = u.ctx;
    const { left, top, width, height } = u.bbox;
    const xs = u.data[0] as number[];
    c.save();
    c.beginPath();
    c.rect(left, top, width, height);
    c.clip();
    if (ctx.def.seasons && ctx.season.length) {
      c.fillStyle = 'rgba(94,176,239,0.09)';
      let start = -1;
      for (let i = 0; i <= xs.length; i++) {
        const winter = i < xs.length && ctx.season[i] < 0.85;
        if (winter && start < 0) start = i;
        if (!winter && start >= 0) {
          const x0 = u.valToPos(xs[start], 'x', true);
          const x1 = u.valToPos(xs[Math.min(i, xs.length - 1)], 'x', true);
          c.fillRect(x0, top, Math.max(1, x1 - x0), height);
          start = -1;
        }
      }
    }
    ctx.def.series.forEach((s, si) => {
      const { min, max } = ctx.bands[si];
      if (!min.length) return;
      c.fillStyle = s.color;
      c.globalAlpha = 0.16;
      c.beginPath();
      // точки: [x, y(max), y(min)]; разрывы там, где разброса нет
      const pts: [number, number, number][] = [];
      const flush = () => {
        if (pts.length > 1) {
          c.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts) c.lineTo(p[0], p[1]);
          for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][2]);
          c.closePath();
        }
        pts.length = 0;
      };
      for (let i = 0; i < xs.length; i++) {
        const a = min[i], b = max[i];
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
          flush();
          continue;
        }
        pts.push([u.valToPos(xs[i], 'x', true), u.valToPos(b, 'y', true), u.valToPos(a, 'y', true)]);
      }
      flush();
      c.fill();
      c.globalAlpha = 1;
    });
    c.restore();
  }

  private drawMarkers(u: uPlot): void {
    const { min, max } = u.scales.x;
    if (min == null || max == null) return;
    const c = u.ctx;
    const { top, height } = u.bbox;
    c.save();
    c.setLineDash([4, 4]);
    c.lineWidth = 1;
    for (const m of this.markers) {
      if (m.tick < min || m.tick > max) continue;
      const x = Math.round(u.valToPos(m.tick, 'x', true)) + 0.5;
      c.strokeStyle = MARKER_COLORS[m.kind];
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, top + height);
      c.stroke();
      c.fillStyle = MARKER_COLORS[m.kind];
      c.beginPath();
      c.moveTo(x - 4, top);
      c.lineTo(x + 4, top);
      c.lineTo(x, top + 6);
      c.fill();
    }
    c.restore();
  }

  private markerTip(u: uPlot, ctx: PlotCtx): void {
    const left = u.cursor.left;
    if (left == null || left < 0) {
      ctx.tip.hidden = true;
      return;
    }
    const near = this.markers.filter((m) => Math.abs(u.valToPos(m.tick, 'x') - left) <= 5);
    if (!near.length) {
      ctx.tip.hidden = true;
      return;
    }
    ctx.tip.hidden = false;
    ctx.tip.innerHTML = near
      .slice(-4)
      .map((m) => `<div><i style="background:${MARKER_COLORS[m.kind]}"></i>${Math.round(m.tick).toLocaleString('ru-RU')}: ${m.text}</div>`)
      .join('');
    ctx.tip.style.left = `${Math.min(left + 60, ctx.box.clientWidth - 260)}px`;
  }

  private applyRange(): void {
    const h = this.history;
    if (!h || !this.plots.length) return;
    const [a, b] = this.win.range(h.firstTime, h.lastTime);
    this.internal = true;
    for (const p of this.plots) p.plot.setScale('x', { min: a, max: b });
    this.internal = false;
  }

  update(h: History, markers: Marker[]): void {
    this.history = h;
    this.markers = markers;
    if (!this.plots.length) return;
    if (h.version !== this.lastVersion) {
      this.lastVersion = h.version;
      const v = h.view();
      for (const p of this.plots) {
        p.season = v.mean.season ?? [];
        const cols = p.def.series.map((s) => smooth(v.mean[s.metric] ?? [], s.points ? 1 : this.smoothK).map((x) => (Number.isFinite(x) ? x : null)));
        p.bands = p.def.series.map((s) => ({ min: v.min[s.metric] ?? [], max: v.max[s.metric] ?? [] }));
        this.internal = true;
        p.plot.setData([v.t, ...cols] as uPlot.AlignedData, false);
        this.internal = false;
      }
    }
    this.applyRange();
  }

  refresh(): void {
    if (this.history) this.update(this.history, this.markers);
  }
}
