import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { History } from '../stats/history';

export interface ChartDef {
  id: string;
  title: string;
  hint?: string;
  series: { metric: string; label: string; color: string }[];
}

const C = { blue: '#5eb0ef', orange: '#ef8a5e', green: '#7ad08a', yellow: '#e0c15a', purple: '#b58cf0', pink: '#ef6f9b' };

/** Список графиков. Новая метрика в stats/metrics.ts + запись здесь = новый график. */
export const CHARTS: ChartDef[] = [
  {
    id: 'pop', title: 'Популяция и еда',
    series: [
      { metric: 'pop', label: 'Бактерий', color: C.blue },
      { metric: 'food', label: 'Еды на поле', color: C.green },
    ],
  },
  {
    id: 'flow', title: 'Рождения и смерти (за 100 тиков)',
    series: [
      { metric: 'births', label: 'Рождения', color: C.green },
      { metric: 'deathsHunger', label: 'Голод', color: C.orange },
      { metric: 'deathsAge', label: 'Старость', color: C.purple },
    ],
  },
  {
    id: 'dir', title: 'Направленность на еду',
    hint: '≈0 — движутся случайно, →1 — едут прямо к еде',
    series: [{ metric: 'directionality', label: 'cos угла к еде', color: C.yellow }],
  },
  {
    id: 'eff', title: 'Еды на бактерию за 1000 тиков',
    series: [{ metric: 'efficiency', label: 'Эффективность', color: C.green }],
  },
  {
    id: 'gen', title: 'Поколения',
    series: [
      { metric: 'avgGen', label: 'Среднее', color: C.blue },
      { metric: 'maxGen', label: 'Максимальное', color: C.pink },
    ],
  },
  {
    id: 'energy', title: 'Средняя энергия',
    series: [{ metric: 'avgEnergy', label: 'Энергия', color: C.orange }],
  },
  {
    id: 'life', title: 'Средняя продолжительность жизни (тиков)',
    series: [{ metric: 'avgLifespan', label: 'Возраст при смерти', color: C.purple }],
  },
  {
    id: 'thrust', title: 'Средняя тяга',
    series: [{ metric: 'avgThrust', label: 'Тяга 0…1', color: C.blue }],
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

const AXIS = { stroke: '#8b95a5', grid: { stroke: '#232b3a', width: 1 }, ticks: { stroke: '#232b3a', width: 1 } };

export class ChartPanel {
  private plots = new Map<string, uPlot>();
  private width = 0;

  constructor(private root: HTMLElement) {
    for (const def of CHARTS) {
      const box = document.createElement('section');
      box.className = 'chart';
      box.dataset.chart = def.id;
      box.innerHTML = `<h3>${def.title}</h3>${def.hint ? `<p class="hint">${def.hint}</p>` : ''}<div class="plot"></div>`;
      root.appendChild(box);
    }
  }

  /** Создаёт/масштабирует графики; вызывать, когда вкладка видна. */
  layout(): void {
    const w = Math.floor(this.root.clientWidth - 2);
    if (w < 100) return;
    for (const def of CHARTS) {
      const holder = this.root.querySelector<HTMLElement>(`[data-chart="${def.id}"] .plot`)!;
      let p = this.plots.get(def.id);
      if (!p) {
        p = new uPlot(
          {
            width: w,
            height: 170,
            scales: { x: { time: false } },
            cursor: { drag: { x: false, y: false } },
            axes: [{ ...AXIS, size: 26 }, { ...AXIS, size: 46 }],
            series: [{ label: 'тик' }, ...def.series.map((s) => ({ label: s.label, stroke: s.color, width: 1.6, spanGaps: true }))],
          },
          [[], ...def.series.map(() => [])],
          holder,
        );
        this.plots.set(def.id, p);
      } else if (w !== this.width) {
        p.setSize({ width: w, height: 170 });
      }
    }
    this.width = w;
  }

  update(h: History): void {
    if (this.width === 0) return;
    for (const def of CHARTS) {
      const p = this.plots.get(def.id);
      if (!p) continue;
      const cols = def.series.map((s) => (h.data[s.metric] ?? []).map((v) => (Number.isFinite(v) ? v : null)));
      p.setData([h.times, ...cols] as uPlot.AlignedData);
    }
  }
}
