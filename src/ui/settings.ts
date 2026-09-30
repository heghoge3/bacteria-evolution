import { type Config, type ParamDef, type ParamKey, PARAMS, PRESETS, defaultConfig, paramDef, presetConfig } from '../core/config';
import type { ScenarioStep, World } from '../sim/world';

const ALL = PARAMS as readonly ParamDef[];

export interface SettingsActions {
  getWorld(): World;
  setLive(key: ParamKey, value: number): void;
  restart(cfg: Config, preset: string): void;
}

/** Шаблоны сценариев: шаги относительно текущего тика. */
const SCENARIO_TEMPLATES: { label: string; steps: (c: Config) => { dt: number; key: ParamKey; value: number }[] }[] = [
  {
    label: 'Кризис еды (через 5k еды в 2.5 раза меньше, через 30k — как было)',
    steps: (c) => [
      { dt: 5000, key: 'foodPerTick', value: +(c.foodPerTick * 0.4).toFixed(2) },
      { dt: 30000, key: 'foodPerTick', value: c.foodPerTick },
    ],
  },
  {
    label: 'Похолодание (через 5k зимы жёстче, через 40k — как было)',
    steps: (c) => [
      { dt: 5000, key: 'seasonAmp', value: 0.95 },
      { dt: 40000, key: 'seasonAmp', value: c.seasonAmp },
    ],
  },
  {
    label: 'Дорогое движение (через 5k движение втрое дороже)',
    steps: (c) => [{ dt: 5000, key: 'moveCost', value: +(c.moveCost * 3).toFixed(3) }],
  },
  {
    label: 'Кусты разбегаются (через 5k быстрый дрейф и слабое восстановление)',
    steps: (c) => [
      { dt: 5000, key: 'patchDrift', value: 0.8 },
      { dt: 5000, key: 'patchRegen', value: +(c.patchRegen / 3).toFixed(4) },
    ],
  },
  {
    label: 'Всё еда — ровным слоем (через 5k кусты перестают работать)',
    steps: () => [{ dt: 5000, key: 'patchShare', value: 0 }],
  },
];

/** Панель настроек строится из схемы PARAMS; внизу — редактор сценария. */
export class SettingsPanel {
  private inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  /** значения, которые применятся при новом запуске */
  pending: Config;
  preset = 'normal';
  private scenarioBox!: HTMLElement;

  constructor(
    private root: HTMLElement,
    private a: SettingsActions,
  ) {
    this.pending = { ...a.getWorld().cfg };
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'settings-bar';
    bar.innerHTML = `
      <div class="presets">${PRESETS.map((p) => `<button data-preset="${p.id}" title="${p.hint}">${p.label}</button>`).join('')}</div>
      <p class="hint">Пресет заполняет поля ниже. Затем «Начать новый запуск». Параметры с ↻ применяются только при новом запуске, остальные — сразу, на лету (и отмечаются на графиках).</p>
      <div class="row"><button data-act="reset" class="primary">Начать новый запуск</button>
      <button data-act="seed">Случайный seed</button><button data-act="defaults">По умолчанию</button></div>`;
    bar.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const preset = el.dataset.preset;
      if (preset) {
        const seed = this.pending.seed;
        this.pending = presetConfig(preset, seed);
        this.preset = preset;
        this.syncInputs();
        this.markPreset();
        return;
      }
      const act = el.dataset.act;
      if (act === 'reset') this.a.restart({ ...this.pending }, this.preset);
      if (act === 'seed') {
        this.pending.seed = Math.floor(Math.random() * 4294967295);
        this.syncInputs();
      }
      if (act === 'defaults') {
        this.pending = { ...defaultConfig(), seed: this.pending.seed };
        this.preset = 'normal';
        this.syncInputs();
        this.markPreset();
      }
    });
    this.root.appendChild(bar);

    const groups = [...new Set(ALL.map((p) => p.group))];
    for (const g of groups) {
      const fs = document.createElement('fieldset');
      fs.innerHTML = `<legend>${g}</legend>`;
      for (const p of ALL.filter((q) => q.group === g)) {
        const row = document.createElement('label');
        row.className = 'param';
        row.innerHTML = `<span>${p.label}${p.restart ? ' <em title="Применится при новом запуске">↻</em>' : ''}${p.hint ? `<small>${p.hint}</small>` : ''}</span>`;
        let inp: HTMLInputElement | HTMLSelectElement;
        if (p.type === 'select') {
          inp = document.createElement('select');
          inp.innerHTML = (p.options ?? []).map((o, i) => `<option value="${i}">${o}</option>`).join('');
        } else {
          inp = document.createElement('input');
          if (p.type === 'bool') inp.type = 'checkbox';
          else {
            inp.type = 'number';
            inp.min = String(p.min);
            inp.max = String(p.max);
            inp.step = String(p.step);
          }
        }
        inp.addEventListener('change', () => {
          let v: number;
          if (inp instanceof HTMLInputElement && inp.type === 'checkbox') v = inp.checked ? 1 : 0;
          else v = Number(inp.value);
          if (!Number.isFinite(v)) v = p.def;
          v = Math.min(p.max, Math.max(p.min, v));
          if (!(inp instanceof HTMLInputElement && inp.type === 'checkbox')) inp.value = String(v);
          this.pending[p.key as ParamKey] = v;
          if (!p.restart) this.a.setLive(p.key as ParamKey, v);
        });
        this.inputs.set(p.key, inp);
        row.appendChild(inp);
        fs.appendChild(row);
      }
      this.root.appendChild(fs);
    }

    // сценарий
    const sc = document.createElement('fieldset');
    sc.innerHTML = `<legend>Сценарий</legend>
      <p class="hint">Запланированные изменения условий: на тике X параметр станет равен Y. Идеально, чтобы посмотреть, как популяция перестраивается.
      Каждое срабатывание отмечается на графиках и в хронике.</p>
      <div class="scenario-list"></div>
      <div class="scenario-add">
        <input type="number" data-f="tick" placeholder="тик" min="0" step="1000"/>
        <select data-f="key">${ALL.filter((p) => !p.restart && p.type !== 'select').map((p) => `<option value="${p.key}">${p.label}</option>`).join('')}</select>
        <input type="number" data-f="value" placeholder="значение" step="any"/>
        <button data-act="add">Добавить</button>
      </div>
      <label class="param"><span>Шаблон</span><select data-f="tpl"><option value="">— выбрать —</option>${SCENARIO_TEMPLATES.map((t, i) => `<option value="${i}">${t.label}</option>`).join('')}</select></label>
      <button data-act="clear">Очистить сценарий</button>`;
    this.scenarioBox = sc;
    sc.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const w = this.a.getWorld();
      if (el.dataset.act === 'add') {
        const tick = Number(sc.querySelector<HTMLInputElement>('[data-f=tick]')!.value);
        const key = sc.querySelector<HTMLSelectElement>('[data-f=key]')!.value as ParamKey;
        const value = Number(sc.querySelector<HTMLInputElement>('[data-f=value]')!.value);
        if (!Number.isFinite(tick) || !Number.isFinite(value)) return;
        w.scenario.push({ tick: Math.max(w.time + 1, Math.round(tick)), key, value });
        this.renderScenario();
      }
      if (el.dataset.act === 'clear') {
        w.scenario.length = 0;
        this.renderScenario();
      }
      if (el.dataset.del !== undefined) {
        w.scenario.splice(Number(el.dataset.del), 1);
        this.renderScenario();
      }
    });
    sc.querySelector<HTMLSelectElement>('[data-f=tpl]')!.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      const tpl = SCENARIO_TEMPLATES[Number(sel.value)];
      sel.value = '';
      if (!tpl) return;
      const w = this.a.getWorld();
      for (const s of tpl.steps(w.cfg)) w.scenario.push({ tick: w.time + s.dt, key: s.key, value: s.value });
      this.renderScenario();
    });
    sc.querySelector<HTMLSelectElement>('[data-f=key]')!.addEventListener('change', (e) => {
      const key = (e.target as HTMLSelectElement).value as ParamKey;
      sc.querySelector<HTMLInputElement>('[data-f=value]')!.value = String(this.a.getWorld().cfg[key]);
    });
    this.root.appendChild(sc);
    this.syncInputs();
    this.markPreset();
  }

  private markPreset(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === this.preset));
  }

  private syncInputs(): void {
    for (const p of ALL) {
      const inp = this.inputs.get(p.key)!;
      const v = this.pending[p.key as ParamKey];
      if (inp instanceof HTMLInputElement && inp.type === 'checkbox') inp.checked = !!v;
      else inp.value = String(v);
    }
  }

  renderScenario(): void {
    const w = this.a.getWorld();
    const list = this.scenarioBox.querySelector('.scenario-list')!;
    const steps: ScenarioStep[] = w.scenario;
    list.innerHTML = steps.length
      ? steps
          .map((s, i) => ({ s, i }))
          .sort((a, b) => a.s.tick - b.s.tick)
          .map(
            ({ s, i }) =>
              `<div class="scenario-row ${s.done ? 'done' : ''}"><time>${s.tick.toLocaleString('ru-RU')}</time><span>${paramDef(s.key)?.label ?? s.key} = <b>${s.value}</b></span>${
                s.done ? '<small>выполнено</small>' : `<button data-del="${i}" title="Удалить">✕</button>`
              }</div>`,
          )
          .join('')
      : '<p class="hint">Сценарий пуст.</p>';
    const tick = this.scenarioBox.querySelector<HTMLInputElement>('[data-f=tick]')!;
    if (!tick.value) tick.value = String(Math.ceil((w.time + 10000) / 1000) * 1000);
  }

  /** Подтянуть значения из мира (после загрузки/нового запуска). */
  sync(preset?: string): void {
    this.pending = { ...this.a.getWorld().cfg };
    if (preset) this.preset = preset;
    this.syncInputs();
    this.markPreset();
    this.renderScenario();
  }

  /** Значение параметра изменилось не из панели (сценарий). */
  syncLive(key: ParamKey, value: number): void {
    this.pending[key] = value;
    const inp = this.inputs.get(key);
    if (!inp) return;
    if (inp instanceof HTMLInputElement && inp.type === 'checkbox') inp.checked = !!value;
    else inp.value = String(value);
  }
}
