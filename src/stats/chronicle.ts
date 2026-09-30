import type { World } from '../sim/world';
import { TYPES } from '../sim/behavior';
import type { StrategyInfo } from './recorder';

/**
 * Хроника: запуск делится на эпохи по смене преобладающего типа поведения
 * или самой массовой стратегии (если новая лидирует долго).
 * Для каждой эпохи копятся цифры и события, из которых собирается текст.
 */
export interface Epoch {
  n: number;
  start: number;
  end: number | null;
  type: number;
  /** самая массовая стратегия эпохи */
  strat: string;
  peakShare: number;
  /** наибольшая доля типа поведения за эпоху */
  typeShare: number;
  popStart: number;
  popEnd: number;
  popMin: number;
  popMax: number;
  dirStart: number;
  dirEnd: number;
  genStart: number;
  genEnd: number;
  traitsStart: Record<string, number>;
  traitsEnd: Record<string, number>;
  events: string[];
  cause: string | null;
  ending: string | null;
}

export interface ChronicleJSON {
  epochs: Epoch[];
  pending: number;
  pendingStart: number;
  pendingType: number;
  causes: { t: number; text: string }[];
}

/** сколько замеров подряд другой тип должен преобладать, чтобы началась новая эпоха */
const PENDING = 8;
/** сколько замеров подряд другая стратегия должна быть самой массовой (≈ 1500 тиков) */
const LEADER_PENDING = 30;
const LEADER_MIN_SHARE = 0.12;
const CAUSE_WINDOW = 4000;
const TRAIT_KEYS = [
  ['size', 'размер'],
  ['speed', 'скорость'],
  ['vision', 'зрение'],
  ['divFood', 'еды до деления'],
  ['lifespan', 'долголетие'],
] as const;

export class Chronicle {
  epochs: Epoch[] = [];
  private pending = 0;
  private pendingStart = 0;
  private pendingType = -1;
  private pendingLeader = '';
  private pendingLeaderN = 0;
  private causes: { t: number; text: string }[] = [];
  private opened: string | null = null;

  get current(): Epoch | null {
    const e = this.epochs[this.epochs.length - 1];
    return e && e.end === null ? e : null;
  }

  /** Событие. cause=true — может объяснить смену эпохи (изменение условий). */
  event(t: number, text: string, cause: boolean): void {
    if (cause) {
      this.causes.push({ t, text });
      if (this.causes.length > 30) this.causes.shift();
    }
    const e = this.current;
    if (e && e.events.length < 6) e.events.push(text);
  }

  close(t: number, ending: string): void {
    const e = this.current;
    if (!e) return;
    e.end = t;
    e.ending = ending;
  }

  takeOpened(): string | null {
    const o = this.opened;
    this.opened = null;
    return o;
  }

  sample(w: World, typeShares: number[], strategies: StrategyInfo[], v: Record<string, number>): void {
    const n = w.bacteria.length;
    if (!n || w.extinct) return;
    let dom = 0;
    for (let i = 1; i < typeShares.length; i++) if (typeShares[i] > typeShares[dom]) dom = i;
    const traits = this.traitMeans(v);
    const t = w.time;
    const leader = strategies[0];
    let e = this.current;
    if (!e) {
      e = this.open(t, dom, n, v, traits, leader);
    } else if (dom !== e.type) {
      // смена преобладающего типа поведения
      this.pendingLeader = '';
      if (this.pendingType !== dom) {
        this.pendingType = dom;
        this.pending = 0;
        this.pendingStart = t;
      }
      this.pending++;
      if (this.pending >= PENDING) {
        e = this.transition(e, `на смену пришли «${TYPES[dom].name}»`, dom, n, v, traits, leader);
      }
    } else {
      this.pending = 0;
      this.pendingType = -1;
      // смена самой массовой стратегии внутри того же типа — тоже новая эпоха, если держится долго
      if (leader && leader.name !== e.strat && leader.share >= LEADER_MIN_SHARE) {
        if (this.pendingLeader !== leader.name) {
          this.pendingLeader = leader.name;
          this.pendingLeaderN = 0;
          this.pendingStart = t;
        }
        this.pendingLeaderN++;
        if (this.pendingLeaderN >= LEADER_PENDING) {
          e = this.transition(e, `самой массовой стала стратегия «${leader.name}»`, dom, n, v, traits, leader);
        }
      } else {
        this.pendingLeader = '';
      }
    }
    // обновляем текущую эпоху
    e.popEnd = n;
    e.popMin = Math.min(e.popMin, n);
    e.popMax = Math.max(e.popMax, n);
    if (Number.isFinite(v.directionality)) e.dirEnd = v.directionality;
    e.genEnd = v.avgGen;
    e.traitsEnd = traits;
    const cur = strategies.find((s) => s.name === e!.strat);
    if (cur && cur.share > e.peakShare) e.peakShare = cur.share;
    if (typeShares[e.type] > e.typeShare) e.typeShare = typeShares[e.type];
  }

  private transition(
    e: Epoch, ending: string, dom: number, n: number, v: Record<string, number>, traits: Record<string, number>, leader: StrategyInfo | undefined,
  ): Epoch {
    e.end = this.pendingStart;
    e.ending = ending;
    const cause = [...this.causes].reverse().find((c) => c.t <= this.pendingStart && c.t >= this.pendingStart - CAUSE_WINDOW);
    const next = this.open(this.pendingStart, dom, n, v, traits, leader);
    next.cause = cause ? cause.text : null;
    this.pending = 0;
    this.pendingType = -1;
    this.pendingLeader = '';
    return next;
  }

  private traitMeans(v: Record<string, number>): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [k] of TRAIT_KEYS) o[k] = v[`trait_${k}`];
    return o;
  }

  private open(t: number, type: number, n: number, v: Record<string, number>, traits: Record<string, number>, leader?: StrategyInfo): Epoch {
    const e: Epoch = {
      n: this.epochs.length + 1, start: t, end: null, type, strat: leader?.name ?? TYPES[type].name, peakShare: leader?.share ?? 0, typeShare: 0,
      popStart: n, popEnd: n, popMin: n, popMax: n,
      dirStart: Number.isFinite(v.directionality) ? v.directionality : 0, dirEnd: v.directionality,
      genStart: v.avgGen, genEnd: v.avgGen, traitsStart: traits, traitsEnd: traits,
      events: [], cause: null, ending: null,
    };
    this.epochs.push(e);
    this.opened = `Эпоха ${e.n}: «${e.strat}»`;
    return e;
  }

  /** Текст хроники: по абзацу на эпоху. */
  render(now: number): { title: string; body: string[]; type: number }[] {
    return this.epochs.map((e) => {
      const end = e.end ?? now;
      const title = `Эпоха ${e.n} · тики ${fmt(e.start)}–${e.end === null ? `${fmt(now)} (идёт)` : fmt(end)}`;
      const body: string[] = [];
      body.push(
        `Самая массовая стратегия — «${e.strat}» (до ${Math.round(e.peakShare * 100)} % популяции); ` +
          `всего тип «${TYPES[e.type].name}» — до ${Math.round((e.typeShare ?? 0) * 100)} %. ` +
          `Численность ${fmt(e.popMin)}–${fmt(e.popMax)}, в начале ${fmt(e.popStart)}, в конце ${fmt(e.popEnd)}.`,
      );
      const parts: string[] = [];
      if (Number.isFinite(e.dirStart) && Number.isFinite(e.dirEnd)) parts.push(`направленность к еде ${e.dirStart.toFixed(2)} → ${e.dirEnd.toFixed(2)}`);
      if (Number.isFinite(e.genStart)) parts.push(`среднее поколение ${e.genStart.toFixed(0)} → ${e.genEnd.toFixed(0)}`);
      for (const [k, label] of TRAIT_KEYS) {
        const a = e.traitsStart[k], b = e.traitsEnd[k];
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) / Math.max(0.01, a) > 0.12) parts.push(`${label} ${a.toFixed(2)} → ${b.toFixed(2)}`);
      }
      if (parts.length) body.push(`${cap(parts.join(', '))}.`);
      if (e.cause) body.push(`Смена началась после изменения условий: ${e.cause}.`);
      if (e.events.length) body.push(`События: ${e.events.join('; ')}.`);
      if (e.ending) body.push(`Конец эпохи: ${e.ending}.`);
      return { title, body, type: e.type };
    });
  }

  toJSON(): ChronicleJSON {
    return { epochs: this.epochs, pending: this.pending, pendingStart: this.pendingStart, pendingType: this.pendingType, causes: this.causes };
  }

  static fromJSON(j: ChronicleJSON | undefined): Chronicle {
    const c = new Chronicle();
    if (j) {
      c.epochs = j.epochs ?? [];
      c.pending = j.pending ?? 0;
      c.pendingStart = j.pendingStart ?? 0;
      c.pendingType = j.pendingType ?? -1;
      c.causes = j.causes ?? [];
    }
    return c;
  }
}

const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
