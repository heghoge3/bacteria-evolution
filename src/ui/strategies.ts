import type { Simulation } from '../sim/simulation';
import type { Bacterium } from '../sim/entities';
import { FP, TYPES } from '../sim/behavior';
import { TRAITS } from '../sim/traits';
import { TypeAreaChart } from './heatmaps';
import type { TimeWindow } from './timewindow';
import type { Focus } from './renderer';

export interface StrategyActions {
  focus(f: Focus): void;
  show(b: Bacterium): void;
  aquarium(b: Bacterium): void;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Вкладка «Стратегии»: доли типов во времени и таблица текущих стратегий. */
export class StrategyPanel {
  private area: TypeAreaChart;
  private list: HTMLElement;
  private legend: HTMLElement;
  private sim: Simulation | null = null;
  private focus: Focus = null;
  private reps = new Map<string, Bacterium>();

  constructor(
    root: HTMLElement,
    win: TimeWindow,
    private actions: StrategyActions,
  ) {
    root.innerHTML = `
      <p class="hint">Каждая бактерия относится к <b>типу поведения</b> по тому, как она двигается (цвет на поле),
      и получает до двух меток по самым заметным чертам тела и привычкам. Тип + метки = <b>стратегия</b>.
      Клик по типу или стратегии — оставить на поле только их.</p>
      <div class="type-legend"></div>
      <section class="heat"><header><h4>Доли типов поведения во времени</h4><span class="heat-info"></span></header><canvas></canvas></section>
      <h3 class="group-title">Стратегии сейчас</h3>
      <div class="strat-list"></div>`;
    this.legend = root.querySelector('.type-legend')!;
    this.list = root.querySelector('.strat-list')!;
    this.area = new TypeAreaChart(root.querySelector('canvas')!, root.querySelector('.heat-info')!, win);
    this.legend.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-type]');
      if (!el) return;
      const idx = Number(el.dataset.type);
      this.actions.focus(this.focus?.kind === 'type' && this.focus.idx === idx ? null : { kind: 'type', idx });
    });
    this.list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-name]');
      if (!row) return;
      const name = row.dataset.name!;
      const rep = this.reps.get(name);
      const act = btn?.dataset.act;
      if (act === 'show' && rep) this.actions.show(rep);
      else if (act === 'aq' && rep) this.actions.aquarium(rep);
      else this.actions.focus(this.focus?.kind === 'strategy' && this.focus.name === name ? null : { kind: 'strategy', name });
    });
  }

  setFocus(f: Focus): void {
    this.focus = f;
  }

  update(sim: Simulation, force = false): void {
    this.sim = sim;
    const w = sim.world;
    const r = sim.recorder;
    const n = w.bacteria.length || 1;
    this.area.update(r.history);
    // пока мышь над списком, не перестраиваем его — иначе клик по кнопке может «потеряться»
    if (!force && (this.list.matches(':hover') || this.legend.matches(':hover'))) return;

    this.legend.innerHTML = TYPES.map((t, i) => {
      const active = this.focus?.kind === 'type' && this.focus.idx === i;
      return `<button data-type="${i}" class="${active ? 'active' : ''}"><i style="background:${t.color}"></i><b>${t.name}</b><small>${t.hint}</small><em>${pct(r.typeCounts[i] / n)}</em></button>`;
    }).join('');

    // средние по популяции и по каждой стратегии
    const groups = new Map<string, Bacterium[]>();
    for (const b of w.bacteria) {
      let g = groups.get(b.strategy);
      if (!g) groups.set(b.strategy, (g = []));
      g.push(b);
    }
    const mean = (list: Bacterium[], f: (b: Bacterium) => number) => list.reduce((s, b) => s + f(b), 0) / Math.max(1, list.length);
    const cols: { label: string; f: (b: Bacterium) => number; d: number }[] = [
      { label: 'скорость', f: (b) => b.fp[FP.speed], d: 2 },
      { label: 'к еде', f: (b) => b.fp[FP.directed], d: 2 },
      ...TRAITS.filter((t) => t.key !== 'childShare').map((t) => ({ label: t.label.toLowerCase(), f: (b: Bacterium) => b.genome.traits[t.key], d: t.key === 'divFood' ? 1 : 2 })),
    ];
    const popMeans = cols.map((c) => mean(w.bacteria, c.f));
    const rows = sim.recorder.currentStrategies().slice(0, 14);
    this.reps.clear();
    this.list.innerHTML = rows.length
      ? rows
          .map((s) => {
            const g = groups.get(s.name) ?? [];
            const rep = g.reduce<Bacterium | null>((best, b) => (!best || b.eaten / (b.age + 1) > best.eaten / (best.age + 1) ? b : best), null);
            if (rep) this.reps.set(s.name, rep);
            const t = TYPES[s.type] ?? TYPES[4];
            const active = this.focus?.kind === 'strategy' && this.focus.name === s.name;
            const stats = cols
              .map((c, i) => {
                const v = mean(g, c.f);
                const diff = popMeans[i] ? v / popMeans[i] - 1 : 0;
                const cls = Math.abs(diff) < 0.08 ? '' : diff > 0 ? 'up' : 'down';
                return `<span class="${cls}">${c.label} <b>${v.toFixed(c.d)}</b></span>`;
              })
              .join('');
            return `<div class="strat ${active ? 'active' : ''}" data-name="${s.name.replace(/"/g, '&quot;')}">
              <div class="strat-head"><i style="background:${t.color}"></i><b>${s.name}</b><em>${s.count} · ${pct(s.share)}</em></div>
              <div class="strat-stats">${stats}</div>
              <div class="strat-foot"><small>с тика ${s.first.toLocaleString('ru-RU')} · пик ${pct(s.peakShare)}</small>
                <span><button data-act="show">Показать</button><button data-act="aq">🔬</button></span></div>
            </div>`;
          })
          .join('')
      : '<p class="hint">Бактерий нет.</p>';
  }

  redraw(): void {
    if (this.sim) this.area.draw();
  }
}
