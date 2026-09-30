import { type Config, normalizeConfig } from '../core/config';
import { Simulation } from '../sim/simulation';
import type { WorldJSON } from '../sim/world';
import type { RecorderJSON } from '../stats/recorder';
import { History } from '../stats/history';
import type { RunSummary } from '../stats/report';

/** Версия формата сохранения. При изменении формата — поднять и добавить миграцию. */
export const SAVE_VERSION = 2;
const DB_NAME = 'bacteria-evolution';
const RUNS_KEY = 'bacteria-evolution:runs';
const MAX_RUNS = 60;

interface SaveFile {
  version: number;
  savedAt: string;
  preset?: string;
  sim: { world: WorldJSON; recorder: RecorderJSON };
}

/** Мир версии 1: механики, которых тогда не было, выключены; режим — песочница. */
const V1_OVERRIDES: Partial<Config> = {
  reseed: 1, sensorMode: 0, senseNeighbors: 0, senseClock: 0, brainType: 0, foodPatches: 0, seasonLength: 0, zones: 0,
  corpseEnergy: 0, collisions: 0, evoTraits: 0, divideCost: 0, speedUpkeep: 0, visionCost: 0, examInterval: 0,
};

/** Приводит старые сохранения к текущему формату. */
function migrate(raw: SaveFile): SaveFile {
  if (raw.version > SAVE_VERSION) throw new Error('Сохранение создано более новой версией приложения');
  if (raw.version === 1) {
    const w = raw.sim.world;
    w.cfg = normalizeConfig({ ...(w.cfg as Record<string, number>), ...V1_OVERRIDES });
    // размер мозга v1 задаётся самим сохранением
    const firstBrain = w.bacteria[0]?.genome.brain as { nHidden?: number } | undefined;
    if (firstBrain?.nHidden) w.cfg.hiddenSize = firstBrain.nHidden;
    const old = raw.sim.recorder as unknown as { history: { interval: number; times: number[]; data: Record<string, number[]> }; journal: RecorderJSON['journal'] };
    raw.sim.recorder = {
      v: 2, history: History.fromLegacy(old.history).toJSON(), heat: { times: [], data: {} }, journal: old.journal ?? [], markers: [],
      lastTick: w.time, lastExam: w.time, strategies: [], lineages: [], lastMaxGenMark: 0, lastReseedLog: -1e9,
      chronicle: { epochs: [], pending: 0, pendingStart: 0, pendingType: -1, causes: [] },
    };
    raw.version = 2;
    raw.preset = 'classic';
  }
  return raw;
}

export function serialize(sim: Simulation, preset: string): string {
  const f: SaveFile = { version: SAVE_VERSION, savedAt: new Date().toISOString(), preset, sim: sim.toJSON() };
  return JSON.stringify(f);
}

export function deserialize(text: string): { sim: Simulation; preset: string } {
  const raw = JSON.parse(text) as SaveFile;
  if (typeof raw?.version !== 'number' || !raw.sim) throw new Error('Это не файл сохранения');
  const f = migrate(raw);
  return { sim: Simulation.fromJSON(f.sim), preset: f.preset ?? 'normal' };
}

// ---------- автосейв в IndexedDB (там нет ограничения в 5 МБ, как у localStorage) ----------
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  d.close();
}

async function idbGet(key: string): Promise<string | undefined> {
  const d = await db();
  const v = await new Promise<string | undefined>((res, rej) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result as string | undefined);
    r.onerror = () => rej(r.error);
  });
  d.close();
  return v;
}

export async function autosave(sim: Simulation, preset: string): Promise<boolean> {
  try {
    await idbSet('autosave', serialize(sim, preset));
    return true;
  } catch {
    return false;
  }
}

export async function loadAutosave(): Promise<{ sim: Simulation; preset: string } | null> {
  try {
    const t = (await idbGet('autosave')) ?? localStorage.getItem('bacteria-evolution:autosave') ?? undefined;
    return t ? deserialize(t) : null;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    localStorage.removeItem('bacteria-evolution:autosave');
    await idbSet('autosave', '');
  } catch {
    /* ignore */
  }
}

// ---------- история запусков ----------
export function loadRuns(): RunSummary[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]') as RunSummary[];
  } catch {
    return [];
  }
}

export function saveRun(s: RunSummary): void {
  try {
    const runs = [s, ...loadRuns().filter((r) => r.id !== s.id)].slice(0, MAX_RUNS);
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

export function deleteRun(id: string): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(loadRuns().filter((r) => r.id !== id)));
  } catch {
    /* ignore */
  }
}

export function download(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
