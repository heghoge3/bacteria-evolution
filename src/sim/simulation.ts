import { type Config } from '../core/config';
import { Recorder, type RecorderJSON } from '../stats/recorder';
import { World, type WorldJSON } from './world';

/** Мир + рекордер статистики. Это единственная точка входа для UI и тестов. */
export class Simulation {
  world: World;
  readonly recorder = new Recorder();

  constructor(world: World, recorderJSON?: RecorderJSON) {
    this.world = world;
    if (recorderJSON) this.recorder.restore(recorderJSON);
    this.recorder.attach(world);
  }

  static create(cfg: Config): Simulation {
    return new Simulation(World.create(cfg));
  }

  step(): void {
    this.world.tick();
    if (this.world.time % this.recorder.history.interval === 0) this.recorder.sample();
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  toJSON(): { world: WorldJSON; recorder: RecorderJSON } {
    return { world: this.world.toJSON(), recorder: this.recorder.toJSON() };
  }

  static fromJSON(j: { world: WorldJSON; recorder: RecorderJSON }): Simulation {
    return new Simulation(World.fromJSON(j.world), j.recorder);
  }
}
