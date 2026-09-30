import uPlot from 'uplot';
import type { RunSummary } from '../stats/report';
import { summaryToMarkdown } from '../stats/report';
import { PRESETS } from '../core/config';
import { TYPES } from '../sim/behavior';
import { deleteRun, download, loadRuns } from '../storage/save';

const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU');
const COLORS = ['#5eb0ef', '#ef8a5e', '#7ad08a', '#e0c15a', '#b58cf0', '#ef6f9b'];
const AXIS = { stroke: '#8b95a5', grid: { stroke: '#232b3a', width: 1 }, ticks: { stroke: '#232b3a', width: 1 } };
const presetLabel = (id: string) => PRESETS.find((p) => p.id === id)?.label ?? id;

function miniChart(el: HTMLElement, width: number, runs: RunSummary[], metric: 'pop' | 'dir', title: string): uPlot {
  const data = uPlot.join(runs.map((r) => [r.series.t, r.series[metric].map((v) => (Number.isFinite(v) ? v : null))] as uPlot.AlignedData));
  return new uPlot(
    {
      width,
      height: 160,
      title,
      scales: { x: { time: false } },
      axes: [{ ...AXIS, size: 26 }, { ...AXIS, size: 46 }],
      series: [{ label: 'тик' }, ...runs.map((r, i) => ({ label: `seed ${r.seed}`, stroke: COLORS[i % COLORS.length], width: 1.6, spanGaps: true }))],
    },
    data,
    el,
  );
}

function summaryHTML(s: RunSummary): string {
  return `
    <div class="cards">
      <div class="card"><span>Прожито тиков</span><b>${fmt(s.ticks)}</b></div>
      <div class="card"><span>Макс. популяция</span><b>${fmt(s.maxPop)}</b></div>
      <div class="card"><span>Макс. поколение</span><b>${fmt(s.maxGen)}</b></div>
      <div class="card"><span>Рождений</span><b>${fmt(s.births)}</b></div>
      <div class="card"><span>Смертей: голод / старость</span><b>${fmt(s.deathsHunger)} / ${fmt(s.deathsAge)}</b></div>
      <div class="card"><span>Самая живучая семья</span><b>${s.longest ? `№${s.longest.id}: ${fmt(s.longest.ticks)}` : '—'}</b></div>
    </div>
    <h3 class="group-title">Стратегии, которые были заметны</h3>
    <div class="chips">${s.strategies.map((x) => `<span class="chip"><i style="background:${TYPES[x.type]?.color ?? '#999'}"></i>${x.name} <b>до ${Math.round(x.peak * 100)} %</b></span>`).join('') || '<p class="hint">—</p>'}</div>
    <h3 class="group-title">Хроника</h3>
    <div class="chronicle">${s.chronicle
      .map((e) => `<article style="border-color:${TYPES[e.type]?.color ?? '#555'}"><h4>${e.title}</h4>${e.body.map((p) => `<p>${p}</p>`).join('')}</article>`)
      .join('')}</div>`;
}

export interface ReportActions {
  repeat(s: RunSummary): void;
  newSeed(s: RunSummary): void;
  close(): void;
}

/** Окно отчёта о завершённом запуске. */
export function showReport(s: RunSummary, a: ReportActions): void {
  document.querySelector('.modal.report')?.remove();
  const m = document.createElement('div');
  m.className = 'modal report';
  m.innerHTML = `<div class="modal-box">
    <header><h2>${s.reason === 'extinct' ? '☠ Популяция вымерла' : '■ Запуск завершён'}</h2><button class="icon" data-a="close" title="Закрыть и посмотреть мир">✕</button></header>
    <p class="report-cause">${s.cause} Seed ${s.seed}, пресет «${presetLabel(s.preset)}».</p>
    <div class="report-charts"><div data-c="pop"></div><div data-c="dir"></div></div>
    ${summaryHTML(s)}
    <footer>
      <button class="primary" data-a="repeat">↻ Повторить (тот же seed)</button>
      <button data-a="new">Новый seed</button>
      <button data-a="md">Сохранить отчёт</button>
      <button data-a="close">Посмотреть мир</button>
    </footer></div>`;
  document.body.appendChild(m);
  const box = m.querySelector<HTMLElement>('.report-charts')!;
  const w = Math.max(260, Math.floor((box.clientWidth - 12) / 2));
  miniChart(m.querySelector('[data-c=pop]')!, w, [s], 'pop', 'Популяция');
  miniChart(m.querySelector('[data-c=dir]')!, w, [s], 'dir', 'Направленность на еду');
  m.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.a;
    if (!act) return;
    if (act === 'md') {
      download(`report-seed${s.seed}.md`, summaryToMarkdown(s), 'text/markdown');
      return;
    }
    m.remove();
    if (act === 'repeat') a.repeat(s);
    else if (act === 'new') a.newSeed(s);
    else a.close();
  });
}

/** Вкладка «Запуски»: история прошлых запусков и сравнение. */
export class RunsPanel {
  private selected = new Set<string>();
  private plots: uPlot[] = [];

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const id = el.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (el.dataset.a === 'del' && id) {
        deleteRun(id);
        this.selected.delete(id);
        this.render();
      } else if (el.dataset.a === 'open' && id) {
        const s = loadRuns().find((r) => r.id === id);
        if (s) showReport(s, { repeat: () => this.onRepeat?.(s), newSeed: () => this.onNew?.(s), close: () => undefined });
      }
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      const id = el.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!id) return;
      if (el.checked) this.selected.add(id);
      else this.selected.delete(id);
      this.renderCompare();
    });
  }

  onRepeat?: (s: RunSummary) => void;
  onNew?: (s: RunSummary) => void;

  render(): void {
    const runs = loadRuns();
    this.root.innerHTML = `<p class="hint">Здесь сохраняются итоги каждого завершённого запуска (при вымирании или по кнопке «Завершить»).
      Отметьте несколько запусков галочкой, чтобы сравнить их графики.</p>
      <div class="compare"></div>
      <div class="runs">${
        runs.length
          ? runs
              .map(
                (r) => `<div class="run" data-id="${r.id}">
          <label><input type="checkbox" ${this.selected.has(r.id) ? 'checked' : ''}/></label>
          <div><b>${r.reason === 'extinct' ? '☠' : '■'} seed ${r.seed} · ${presetLabel(r.preset)}</b>
          <small>${new Date(r.date).toLocaleString('ru-RU')} · ${fmt(r.ticks)} тиков · макс. поп. ${fmt(r.maxPop)} · поколение ${fmt(r.maxGen)}${
            Object.keys(r.cfgDiff).length ? ` · изменено параметров: ${Object.keys(r.cfgDiff).length}` : ''
          }</small></div>
          <button data-a="open">Отчёт</button><button data-a="del" title="Удалить">✕</button></div>`,
              )
              .join('')
          : '<p class="hint">Пока нет завершённых запусков.</p>'
      }</div>`;
    this.renderCompare();
  }

  private renderCompare(): void {
    for (const p of this.plots) p.destroy();
    this.plots = [];
    const box = this.root.querySelector<HTMLElement>('.compare');
    if (!box) return;
    box.innerHTML = '';
    const runs = loadRuns().filter((r) => this.selected.has(r.id)).slice(0, 6);
    if (!runs.length) return;
    const w = Math.floor(this.root.clientWidth - 4);
    const a = document.createElement('div');
    const b = document.createElement('div');
    box.append(a, b);
    this.plots.push(miniChart(a, w, runs, 'pop', 'Сравнение: популяция'), miniChart(b, w, runs, 'dir', 'Сравнение: направленность на еду'));
  }
}
