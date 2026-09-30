import type { World } from '../world';
import type { Bacterium } from '../entities';

/** Сенсор заполняет `size` входов мозга, начиная с out[o]. */
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
      out[o + 2] = 1 - b.foodDist / w.cfg.visionRadius;
    } else {
      out[o] = out[o + 1] = out[o + 2] = 0;
    }
  },
};

const energy: Sensor = {
  id: 'energy',
  labels: ['энергия'],
  fill(b, w, out, o) {
    out[o] = Math.min(1, b.energy / w.cfg.maxEnergy);
  },
};

const bias: Sensor = {
  id: 'bias',
  labels: ['смещение'],
  fill(_b, _w, out, o) {
    out[o] = 1;
  },
};

/** Порядок важен: он задаёт порядок входов мозга. */
export const defaultSensors: Sensor[] = [nearestFood, energy, bias];
