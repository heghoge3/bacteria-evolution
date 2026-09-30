import { type Config, PARAMS, defaultConfig } from '../core/config';

/** Панель настроек строится из схемы PARAMS. */
export class SettingsPanel {
  private inputs = new Map<string, HTMLInputElement>();
  /** значения, которые применятся при сбросе мира */
  pending: Config;

  constructor(
    private root: HTMLElement,
    private getLive: () => Config,
    private onLive: (key: keyof Config, value: number) => void,
    private onReset: (cfg: Config) => void,
  ) {
    this.pending = { ...getLive() };
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'settings-bar';
    bar.innerHTML = `<button data-act="reset" class="primary">Применить и начать заново</button>
      <button data-act="defaults">Значения по умолчанию</button>
      <p class="hint">Параметры с пометкой ↻ меняются только при новом запуске. Остальные — сразу, на лету.</p>`;
    bar.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'reset') this.onReset({ ...this.pending });
      if (act === 'defaults') {
        this.pending = defaultConfig();
        for (const p of PARAMS) {
          this.inputs.get(p.key)!.value = String(p.def);
          if (!('restart' in p && p.restart)) this.onLive(p.key, p.def);
        }
      }
    });
    this.root.appendChild(bar);

    const groups = [...new Set(PARAMS.map((p) => p.group))];
    for (const g of groups) {
      const fs = document.createElement('fieldset');
      fs.innerHTML = `<legend>${g}</legend>`;
      for (const p of PARAMS.filter((q) => q.group === g)) {
        const restart = 'restart' in p && p.restart;
        const row = document.createElement('label');
        row.className = 'param';
        row.innerHTML = `<span>${p.label}${restart ? ' <em title="Применится после нового запуска">↻</em>' : ''}</span>`;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = String(p.min);
        inp.max = String(p.max);
        inp.step = String(p.step);
        inp.value = String(this.pending[p.key]);
        inp.addEventListener('change', () => {
          let v = Number(inp.value);
          if (!Number.isFinite(v)) v = p.def;
          v = Math.min(p.max, Math.max(p.min, v));
          inp.value = String(v);
          this.pending[p.key] = v;
          if (!restart) this.onLive(p.key, v);
        });
        this.inputs.set(p.key, inp);
        row.appendChild(inp);
        fs.appendChild(row);
      }
      this.root.appendChild(fs);
    }
  }

  /** Подтянуть значения из мира (после загрузки сохранения/сброса). */
  sync(): void {
    this.pending = { ...this.getLive() };
    for (const p of PARAMS) this.inputs.get(p.key)!.value = String(this.pending[p.key]);
  }
}
