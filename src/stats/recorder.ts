import { type World, newAccum } from '../sim/world';
import { History } from './history';
import { METRICS } from './metrics';

export interface JournalEntry {
  tick: number;
  kind: 'info' | 'record' | 'warn' | 'config';
  text: string;
}

const MAX_JOURNAL = 500;
const BIG_LINEAGE = 12;

export interface RecorderJSON {
  history: ReturnType<History['toJSON']>;
  journal: JournalEntry[];
  lastTick: number;
  peaks: [number, number][];
  lastMaxGenMark: number;
  lastReseedLog: number;
}

/** Собирает историю метрик и ведёт журнал событий. Работает и без интерфейса. */
export class Recorder {
  history = new History(50);
  journal: JournalEntry[] = [];
  private lastTick = 0;
  /** пик численности семьи (только живые семьи) */
  private peaks = new Map<number, number>();
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
          this.log('warn', `Подсев ${this.pendingReseeded} случайных бактерий (популяция ниже минимума)`);
          this.pendingReseeded = 0;
          this.lastReseedLog = world.time;
        }
      }),
      world.events.on('configChanged', (e) => this.log('config', `Параметр «${e.key}» = ${e.value}`)),
    ];
  }

  log(kind: JournalEntry['kind'], text: string): void {
    this.journal.push({ tick: this.world.time, kind, text });
    if (this.journal.length > MAX_JOURNAL) this.journal.shift();
  }

  /** Долей крупнейших семей и счётчик живых семей. */
  lineageStats(): { shares: number[]; alive: number } {
    const counts = new Map<number, number>();
    for (const b of this.world.bacteria) counts.set(b.lineage, (counts.get(b.lineage) ?? 0) + 1);
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const n = this.world.bacteria.length || 1;
    return { shares: sorted.slice(0, 5).map((v) => v / n), alive: counts.size };
  }

  sample(): void {
    const w = this.world;
    const ticks = w.time - this.lastTick;
    this.lastTick = w.time;
    const { shares } = this.lineageStats();
    const prevIdx = this.history.times.length - 1;
    const ctx = {
      world: w,
      acc: w.acc,
      ticks,
      lineageShares: shares,
      prev: (id: string) => this.history.data[id]?.[prevIdx] ?? 0,
    };
    const values: Record<string, number> = {};
    for (const m of METRICS) values[m.id] = m.compute(ctx);
    this.history.push(w.time, values);
    w.acc = newAccum();
    this.updateJournal();
  }

  private updateJournal(): void {
    const w = this.world;
    // рекорд поколения — раз в 10 поколений
    const mark = Math.floor(w.totals.maxGen / 10) * 10;
    if (mark > this.lastMaxGenMark) {
      this.lastMaxGenMark = mark;
      this.log('record', `Рекорд: достигнуто поколение ${w.totals.maxGen}`);
    }
    // вымирание крупных семей
    const counts = new Map<number, number>();
    for (const b of w.bacteria) counts.set(b.lineage, (counts.get(b.lineage) ?? 0) + 1);
    for (const [id, peak] of this.peaks) {
      if (!counts.has(id)) {
        if (peak >= BIG_LINEAGE) this.log('info', `Семья №${id} вымерла (пик ${peak} особей)`);
        this.peaks.delete(id);
      }
    }
    for (const [id, n] of counts) if (n > (this.peaks.get(id) ?? 0)) this.peaks.set(id, n);
  }

  toJSON(): RecorderJSON {
    return {
      history: this.history.toJSON(),
      journal: this.journal,
      lastTick: this.lastTick,
      peaks: [...this.peaks],
      lastMaxGenMark: this.lastMaxGenMark,
      lastReseedLog: this.lastReseedLog,
    };
  }

  restore(j: RecorderJSON): void {
    this.history = History.fromJSON(j.history);
    this.journal = j.journal ?? [];
    this.lastTick = j.lastTick;
    this.peaks = new Map(j.peaks ?? []);
    this.lastMaxGenMark = j.lastMaxGenMark ?? 0;
    this.lastReseedLog = j.lastReseedLog ?? -1e9;
  }

  toCSV(): string {
    const ids = METRICS.map((m) => m.id);
    const rows = [['tick', ...ids].join(',')];
    this.history.times.forEach((t, i) => {
      rows.push([t, ...ids.map((id) => (this.history.data[id]?.[i] ?? '').toString())].join(','));
    });
    return rows.join('\n');
  }
}
