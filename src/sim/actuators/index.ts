import type { World } from '../world';
import type { Bacterium } from '../entities';

/** Действие: получает один выход мозга в диапазоне [-1, 1]. */
export interface Actuator {
  id: string;
  label: string;
  apply(b: Bacterium, v: number, w: World): void;
}

const turn: Actuator = {
  id: 'turn',
  label: 'поворот',
  apply(b, v, w) {
    b.turn = v;
    b.angle += v * w.cfg.maxTurn;
  },
};

const thrust: Actuator = {
  id: 'thrust',
  label: 'тяга',
  apply(b, v) {
    b.thrust = (v + 1) / 2;
  },
};

export const defaultActuators: Actuator[] = [turn, thrust];
