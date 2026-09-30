import type { Config } from '../core/config';
import type { Rng } from '../core/rng';

/** Куст еды: еда появляется вокруг центра, куст истощается и медленно дрейфует. */
export interface Patch {
  x: number;
  y: number;
  /** 0.05…1 — насколько куст «жив» (влияет на частоту появления еды) */
  health: number;
  dir: number;
}

export const ZONE_TYPES = [
  { name: 'Вязкая', hint: 'движение медленнее и дороже', fill: 'rgba(80,120,220,0.13)', stroke: 'rgba(110,150,255,0.45)' },
  { name: 'Токсичная', hint: 'еды больше, но жизнь там стоит энергии', fill: 'rgba(190,80,220,0.13)', stroke: 'rgba(210,110,240,0.5)' },
] as const;

export interface Zone {
  x: number;
  y: number;
  r: number;
  /** индекс в ZONE_TYPES */
  type: number;
}

export function makePatches(cfg: Config, rng: Rng): Patch[] {
  if (!cfg.foodPatches) return [];
  const m = Math.min(cfg.fieldW, cfg.fieldH) * 0.12;
  return Array.from({ length: cfg.patchCount }, () => ({
    x: rng.range(m, cfg.fieldW - m),
    y: rng.range(m, cfg.fieldH - m),
    health: 1,
    dir: rng.range(0, Math.PI * 2),
  }));
}

export function makeZones(cfg: Config, rng: Rng): Zone[] {
  if (!cfg.zones) return [];
  return Array.from({ length: cfg.zoneCount }, (_, i) => ({
    x: rng.range(0, cfg.fieldW),
    y: rng.range(0, cfg.fieldH),
    r: cfg.zoneRadius * rng.range(0.7, 1.3),
    type: i % ZONE_TYPES.length,
  }));
}

/** Множитель появления еды от сезона: >1 — лето, <1 — зима. */
export function seasonFactor(cfg: Config, time: number): number {
  if (cfg.seasonLength <= 0) return 1;
  return Math.max(0, 1 + cfg.seasonAmp * Math.sin((2 * Math.PI * time) / cfg.seasonLength));
}

/** Фаза сезона для сенсора: -1 (разгар зимы) … 1 (разгар лета). */
export function seasonPhase(cfg: Config, time: number): number {
  if (cfg.seasonLength <= 0) return 0;
  return Math.sin((2 * Math.PI * time) / cfg.seasonLength);
}

export function seasonName(cfg: Config, time: number): string {
  if (cfg.seasonLength <= 0 || cfg.seasonAmp === 0) return '';
  const p = seasonPhase(cfg, time);
  const rising = Math.cos((2 * Math.PI * time) / cfg.seasonLength) > 0;
  if (p > 0.5) return 'лето';
  if (p < -0.5) return 'зима';
  return rising ? 'весна' : 'осень';
}
