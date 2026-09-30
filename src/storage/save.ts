import { Simulation } from '../sim/simulation';

/** Версия формата сохранения. При изменении формата — поднять и добавить миграцию. */
export const SAVE_VERSION = 1;
const AUTOSAVE_KEY = 'bacteria-evolution:autosave';

interface SaveFile {
  version: number;
  savedAt: string;
  sim: ReturnType<Simulation['toJSON']>;
}

/** Приводит старые сохранения к текущему формату. */
function migrate(raw: SaveFile): SaveFile {
  // пока формат один; когда появится v2 — здесь: if (raw.version === 1) { ...; raw.version = 2 }
  if (raw.version > SAVE_VERSION) throw new Error('Сохранение создано более новой версией приложения');
  return raw;
}

export function serialize(sim: Simulation): string {
  const f: SaveFile = { version: SAVE_VERSION, savedAt: new Date().toISOString(), sim: sim.toJSON() };
  return JSON.stringify(f);
}

export function deserialize(text: string): Simulation {
  const raw = JSON.parse(text) as SaveFile;
  if (typeof raw?.version !== 'number' || !raw.sim) throw new Error('Это не файл сохранения');
  return Simulation.fromJSON(migrate(raw).sim);
}

export function autosave(sim: Simulation): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serialize(sim));
    return true;
  } catch {
    return false;
  }
}

export function loadAutosave(): Simulation | null {
  try {
    const t = localStorage.getItem(AUTOSAVE_KEY);
    return t ? deserialize(t) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
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
