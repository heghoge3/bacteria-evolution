import type { Config } from '../../core/config';
import type { World } from '../world';
import type { Bacterium } from '../entities';
import { seasonPhase } from '../env';

/** Сенсор заполняет labels.length входов мозга, начиная с out[o]. */
export interface Sensor {
  id: string;
  labels: string[];
  fill(b: Bacterium, w: World, out: Float32Array, o: number): void;
}

const nearestFood: Sensor = {
  id: 'nearestFood',
  labels: ['еда: sin', 'еда: cos', 'еда: близость'],
  fill(b, w, out, o) {
    if (b.seesFood) {
      out[o] = Math.sin(b.dAngle);
      out[o + 1] = Math.cos(b.dAngle);
      out[o + 2] = 1 - b.foodDist / w.visionOf(b);
    } else {
      out[o] = out[o + 1] = out[o + 2] = 0;
    }
  },
};

/** Подпись сектора: 0 — прямо, далее по часовой стрелке. */
function sectorLabels(prefix: string, k: number): string[] {
  return Array.from({ length: k }, (_, i) => {
    const deg = Math.round((i * 360) / k);
    return `${prefix} ${deg > 180 ? deg - 360 : deg}°`;
  });
}

const foodSectors = (k: number): Sensor => ({
  id: 'foodSectors',
  labels: sectorLabels('еда', k),
  fill(b, _w, out, o) {
    for (let i = 0; i < k; i++) out[o + i] = b.sFood[i];
  },
});

const peerSectors = (k: number): Sensor => ({
  id: 'peerSectors',
  labels: sectorLabels('сосед', k),
  fill(b, _w, out, o) {
    for (let i = 0; i < k; i++) out[o + i] = b.sPeer[i];
  },
});

const nearestPeer: Sensor = {
  id: 'nearestPeer',
  labels: ['соседи рядом'],
  fill(b, _w, out, o) {
    out[o] = Math.min(1, b.crowd / 3);
  },
};

const wallAhead: Sensor = {
  id: 'wallAhead',
  labels: ['стена впереди'],
  fill(b, w, out, o) {
    const r = w.visionOf(b);
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const tx = c > 1e-6 ? (w.cfg.fieldW - b.x) / c : c < -1e-6 ? -b.x / c : Infinity;
    const ty = s > 1e-6 ? (w.cfg.fieldH - b.y) / s : s < -1e-6 ? -b.y / s : Infinity;
    out[o] = 1 - Math.min(r, tx, ty) / r;
  },
};

const energy: Sensor = {
  id: 'energy',
  labels: ['энергия'],
  fill(b, w, out, o) {
    out[o] = Math.min(1, b.energy / w.maxEnergyOf(b));
  },
};

const clock: Sensor = {
  id: 'clock',
  labels: ['часы: sin', 'часы: cos', 'сезон'],
  fill(b, w, out, o) {
    const a = (b.age / 400) * Math.PI * 2;
    out[o] = Math.sin(a);
    out[o + 1] = Math.cos(a);
    out[o + 2] = seasonPhase(w.cfg, w.time);
  },
};

const bias: Sensor = {
  id: 'bias',
  labels: ['смещение'],
  fill(_b, _w, out, o) {
    out[o] = 1;
  },
};

/** Набор сенсоров определяется настройками мира. Порядок задаёт порядок входов мозга. */
export function buildSensors(cfg: Config): Sensor[] {
  const k = cfg.sectors;
  const list: Sensor[] = [];
  if (cfg.sensorMode === 1) list.push(foodSectors(k));
  else list.push(nearestFood);
  if (cfg.senseNeighbors) list.push(cfg.sensorMode === 1 ? peerSectors(k) : nearestPeer);
  if (cfg.sensorMode === 1) list.push(wallAhead);
  list.push(energy);
  if (cfg.senseClock) list.push(clock);
  list.push(bias);
  return list;
}
