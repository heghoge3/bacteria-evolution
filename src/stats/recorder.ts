import { paramDef } from '../core/config';
import { type World, newAccum } from '../sim/world';
import { TYPES, classify } from '../sim/behavior';
import { HeatHistory, History, type HistoryJSON } from './history';
import { METRICS } from './metrics';
import { histograms } from './heat';
import { runExam } from './exam';
import { Chronicle, type ChronicleJSON } from './chronicle';

export interface JournalEntry {
  tick: number;
  kind: 'info' | 'record' | 'warn' | 'config' | 'strategy' | 'extinct';
  text: string;
}

/** Метка на графиках. */
export interface Marker {
  tick: number;
  kind: 'config' | 'scenario' | 'strategy' | 'lineage' | 'extinct' | 'epoch';
  text: string;
}

export interface StrategyInfo {
  name: string;
  type: number;
  first: number;
  last: number;
  count: number;
  share: number;
  peakShare: number;
  peakTick: number;
  announced: boolean;
}

export interface LineageInfo {
  id: number;
  first: number;
  last: number;
  peak: number;
  hue: number;
  dead?: boolean;
}

const MAX_JOURNAL = 500;
const MAX_MARKERS = 400;
const BIG_LINEAGE = 12;
/** доля, с которой стратегия считается «заметной» */
export const STRATEGY_SHARE = 0.05;

export interface RecorderJSON {
  v: 2;
  history: HistoryJSON;
  heat: ReturnType<HeatHistory['toJSON']>;
  journal: JournalEntry[];
  markers: Marker[];
  lastTick: number;
  lastExam: number;
  strategies: StrategyInfo[];
  lineages: LineageInfo[];
  lastMaxGenMark: number;
  lastReseedLog: number;
  chronicle: ChronicleJSON;
}

/** Собирает историю метрик, стратегии, хронику и журнал. Работает и без интерфейса. */
export class Recorder {
  history = new History(50);
  heat = new HeatHistory();
  journal: JournalEntry[] = [];
  markers: Marker[] = [];
  strategies = new Map<string, StrategyInfo>();
  lineages = new Map<number, LineageInfo>();
  chronicle = new Chronicle();
  /** счётчики на последнем замере */
  typeCounts: number[] = TYPES.map(() => 0);
  private lastTick = 0;
  private lastExam = 0;
  private lastMaxGenMark = 0;
  private lastReseedLog = -1e9;
  private pendingReseeded = 0;
  private world!: World;
  private unsubs: (() => void)[] = [];

  attach(world: World): void {
    this.unsubs.forEach((f) => f());
    this.world = world;
    this.lastTick = world.time;
    this.unsubs = [
      world.events.on('reseeded', (e) => {
        this.pendingReseeded += e.count;
        if (world.time - this.lastReseedLog >= 500) {
          this.log('warn', `Подсев ${this.pendingReseeded} случайных бактерий (песочница)`);
          this.pendingReseeded = 0;
          this.lastReseedLog = world.time;
        }
      }),
      world.events.on('configChanged', (e) => {
        const label = paramDef(e.key)?.label ?? e.key;
        const text = `${e.source === 'scenario' ? 'Сценарий: ' : ''}«${label}» ${fmtNum(e.old)} → ${fmtNum(e.value)}`;
        this.log('config', text);
        this.mark(e.source === 'scenario' ? 'scenario' : 'config', text);
        this.chronicle.event(world.time, text, true);
      }),
      world.events.on('extinct', (e) => {
        this.sample();
        const text = 'Популяция вымерла';
        this.log('extinct', text);
        this.mark('extinct', text);
        this.chronicle.close(e.tick, text);
      }),
    ];
  }

  log(kind: JournalEntry['kind'], text: string): void {
    this.journal.push({ tick: this.world.time, kind, text });
    if (this.journal.length > MAX_JOURNAL) this.journal.shift();
  }

  mark(kind: Marker['kind'], text: string): void {
    this.markers.push({ tick: this.world.time, kind, text });
    if (this.markers.length > MAX_MARKERS) this.markers.shift();
  }

  /** Доли крупнейших семей и число живых семей. */
  lineageStats(): { shares: number[]; alive: number; counts: Map<number, number> } {
    const counts = new Map<number, number>();
    for (const b of this.world.bacteria) counts.set(b.lineage, (counts.get(b.lineage) ?? 0) + 1);
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const n = this.world.bacteria.length || 1;
    return { shares: sorted.slice(0, 5).map((v) => v / n), alive: counts.size, counts };
  }

  /** Текущие стратегии, отсортированные по численности. */
  currentStrategies(): StrategyInfo[] {
    return [...this.strategies.values()].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  }

  sample(): void {
    const w = this.world;
    if (w.time === this.lastTick && this.history.length) return;
    const ticks = w.time - this.lastTick;
    this.lastTick = w.time;
    const n = w.bacteria.length;

    // классификация поведения
    const typeCounts = TYPES.map(() => 0);
    const stratCounts = new Map<string, number>();
    for (const b of w.bacteria) {
      classify(b);
      typeCounts[b.type]++;
      stratCounts.set(b.strategy, (stratCounts.get(b.strategy) ?? 0) + 1);
    }
    this.typeCounts = typeCounts;
    const typeShares = typeCounts.map((c) => (n ? c / n : 0));
    const notable = this.updateStrategies(stratCounts, n);

    const { shares, counts } = this.lineageStats();
    this.updateLineages(counts);

    const ctx = {
      world: w, acc: w.acc, ticks, lineageShares: shares, typeShares, strategies: notable,
      prev: (id: string) => this.history.last(id),
    };
    const values: Record<string, number> = {};
    for (const m of METRICS) values[m.id] = m.compute(ctx);

    // экзамен
    values.exam = NaN;
    values.examBest = NaN;
    if (w.cfg.examInterval > 0 && n && w.time - this.lastExam >= w.cfg.examInterval) {
      this.lastExam = w.time;
      const r = runExam(w);
      if (r) {
        values.exam = r.mean;
        values.examBest = r.best;
      }
    }

    this.history.push(w.time, values);
    this.heat.push(w.time, histograms(w));
    w.acc = newAccum();
    this.updateJournal();
    this.chronicle.sample(w, typeShares, this.currentStrategies(), values);
    const opened = this.chronicle.takeOpened();
    if (opened) this.mark('epoch', opened);
  }

  private updateStrategies(counts: Map<string, number>, n: number): number {
    const t = this.world.time;
    for (const s of this.strategies.values()) {
      s.count = 0;
      s.share = 0;
    }
    let notable = 0;
    for (const [name, c] of counts) {
      let s = this.strategies.get(name);
      if (!s) {
        const type = TYPES.findIndex((x) => name === x.name || name.startsWith(`${x.name} ·`));
        s = { name, type, first: t, last: t, count: 0, share: 0, peakShare: 0, peakTick: t, announced: false };
        this.strategies.set(name, s);
      }
      s.count = c;
      s.share = n ? c / n : 0;
      s.last = t;
      if (s.share > s.peakShare) {
        s.peakShare = s.share;
        s.peakTick = t;
      }
      if (s.share >= STRATEGY_SHARE) notable++;
      if (!s.announced && s.share >= STRATEGY_SHARE && c >= 5 && t > 0) {
        s.announced = true;
        const text = `Появилась стратегия «${name}» (${Math.round(s.share * 100)} %)`;
        this.log('strategy', text);
        this.mark('strategy', text);
        this.chronicle.event(t, text, false);
      }
    }
    // исчезнувшие заметные стратегии
    for (const s of this.strategies.values()) {
      if (s.count === 0 && s.announced && s.last < t) {
        s.announced = false;
        if (s.peakShare >= 0.1) {
          const text = `Исчезла стратегия «${s.name}» (была до ${Math.round(s.peakShare * 100)} %)`;
          this.log('strategy', text);
          this.chronicle.event(t, text, false);
        }
      }
    }
    // не держим тысячи редких комбинаций
    if (this.strategies.size > 400) {
      for (const [k, s] of this.strategies) if (s.count === 0 && s.peakShare < STRATEGY_SHARE) this.strategies.delete(k);
    }
    return notable;
  }

  private updateLineages(counts: Map<number, number>): void {
    const t = this.world.time;
    const hueOf = new Map<number, number>();
    for (const b of this.world.bacteria) if (!hueOf.has(b.lineage)) hueOf.set(b.lineage, b.genome.hue);
    for (const [id, c] of counts) {
      const l = this.lineages.get(id);
      if (l) {
        l.last = t;
        if (c > l.peak) l.peak = c;
      } else {
        this.lineages.set(id, { id, first: t, last: t, peak: c, hue: hueOf.get(id) ?? 0 });
      }
    }
    for (const [id, l] of this.lineages) {
      if (counts.has(id) || l.dead) continue;
      if (l.peak >= BIG_LINEAGE) {
        // крупные семьи остаются в памяти для отчёта
        l.dead = true;
        const text = `Семья №${id} вымерла (прожила ${fmtNum(l.last - l.first)} тиков, пик ${l.peak} особей)`;
        this.log('info', text);
        if (l.peak >= BIG_LINEAGE * 3) this.mark('lineage', text);
      } else {
        this.lineages.delete(id);
      }
    }
    if (this.lineages.size > 300) {
      const dead = [...this.lineages.values()].filter((l) => !counts.has(l.id)).sort((a, b) => b.last - b.first - (a.last - a.first));
      for (const l of dead.slice(100)) this.lineages.delete(l.id);
    }
  }

  private updateJournal(): void {
    const w = this.world;
    const mark = Math.floor(w.totals.maxGen / 25) * 25;
    if (mark > this.lastMaxGenMark) {
      this.lastMaxGenMark = mark;
      this.log('record', `Рекорд: достигнуто поколение ${w.totals.maxGen}`);
    }
  }

  toJSON(): RecorderJSON {
    return {
      v: 2,
      history: this.history.toJSON(),
      heat: this.heat.toJSON(),
      journal: this.journal,
      markers: this.markers,
      lastTick: this.lastTick,
      lastExam: this.lastExam,
      strategies: [...this.strategies.values()],
      lineages: [...this.lineages.values()],
      lastMaxGenMark: this.lastMaxGenMark,
      lastReseedLog: this.lastReseedLog,
      chronicle: this.chronicle.toJSON(),
    };
  }

  restore(j: RecorderJSON): void {
    this.history = History.fromJSON(j.history);
    this.heat = HeatHistory.fromJSON(j.heat);
    this.journal = j.journal ?? [];
    this.markers = j.markers ?? [];
    this.lastTick = j.lastTick;
    this.lastExam = j.lastExam ?? 0;
    this.strategies = new Map((j.strategies ?? []).map((s) => [s.name, s]));
    this.lineages = new Map((j.lineages ?? []).map((l) => [l.id, l]));
    this.lastMaxGenMark = j.lastMaxGenMark ?? 0;
    this.lastReseedLog = j.lastReseedLog ?? -1e9;
    this.chronicle = Chronicle.fromJSON(j.chronicle);
  }

  toCSV(): string {
    const v = this.history.view();
    const ids = Object.keys(v.mean);
    const rows = [['tick', ...ids].join(',')];
    v.t.forEach((t, i) => {
      rows.push([t, ...ids.map((id) => (Number.isFinite(v.mean[id][i]) ? Math.round(v.mean[id][i] * 1000) / 1000 : ''))].join(','));
    });
    return rows.join('\n');
  }
}

export const fmtNum = (v: number): string =>
  Number.isInteger(v) ? v.toLocaleString('ru-RU') : v.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
