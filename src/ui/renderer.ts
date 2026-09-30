import type { Bacterium } from '../sim/entities';
import type { World } from '../sim/world';
import { TYPES } from '../sim/behavior';
import { ZONE_TYPES } from '../sim/env';

export type ColorMode = 'type' | 'lineage' | 'energy' | 'generation' | 'size';

export type Focus =
  | { kind: 'type'; idx: number }
  | { kind: 'strategy'; name: string }
  | { kind: 'lineage'; id: number }
  | null;

export interface DrawOpts {
  color: ColorMode;
  vision: boolean;
  trails: boolean;
  selected: Bacterium | null;
  focus: Focus;
}

export function inFocus(b: Bacterium, f: Focus): boolean {
  if (!f) return true;
  if (f.kind === 'type') return b.type === f.idx;
  if (f.kind === 'strategy') return b.strategy === f.name;
  return b.lineage === f.id;
}

const TRAIL_LEN = 90;
const TRAIL_MAX = 250;

/** Рисует поле на canvas; хранит камеру (масштаб и сдвиг) и следы движения. */
export class Renderer {
  scale = 1;
  ox = 0;
  oy = 0;
  /** пользователь двигал камеру — не пересобирать «вписать в окно» */
  userMoved = false;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  cw = 0;
  ch = 0;
  private trails = new Map<number, number[]>();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(fieldW: number, fieldH: number): void {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cw = Math.max(50, r.width);
    this.ch = Math.max(50, r.height);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    if (!this.userMoved) this.fit(fieldW, fieldH);
  }

  fit(fieldW: number, fieldH: number): void {
    const pad = 16;
    this.scale = Math.min((this.cw - pad * 2) / fieldW, (this.ch - pad * 2) / fieldH);
    this.ox = (this.cw - fieldW * this.scale) / 2;
    this.oy = (this.ch - fieldH * this.scale) / 2;
    this.userMoved = false;
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(20, Math.max(0.1, this.scale * factor));
    this.ox = sx - wx * this.scale;
    this.oy = sy - wy * this.scale;
    this.userMoved = true;
  }

  panBy(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
    this.userMoved = true;
  }

  centerOn(wx: number, wy: number): void {
    this.ox = this.cw / 2 - wx * this.scale;
    this.oy = this.ch / 2 - wy * this.scale;
    this.userMoved = true;
  }

  clearTrails(): void {
    this.trails.clear();
  }

  /** Запоминает позиции для следов (вызывать каждый кадр). */
  private recordTrails(world: World, o: DrawOpts): void {
    if (!o.trails) {
      if (this.trails.size) this.trails.clear();
      return;
    }
    const alive = new Set<number>();
    let n = 0;
    for (const b of world.bacteria) {
      const want = b === o.selected || (o.focus && inFocus(b, o.focus));
      if (!want || n >= TRAIL_MAX) continue;
      n++;
      alive.add(b.id);
      let t = this.trails.get(b.id);
      if (!t) this.trails.set(b.id, (t = []));
      const lx = t[t.length - 2], ly = t[t.length - 1];
      if (lx === undefined || Math.abs(lx - b.x) + Math.abs(ly - b.y) > 0.5) {
        t.push(b.x, b.y);
        if (t.length > TRAIL_LEN * 2) t.splice(0, 2);
      }
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
  }

  draw(world: World, o: DrawOpts): void {
    const { ctx, dpr, scale } = this;
    const cfg = world.cfg;
    this.recordTrails(world, o);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * this.ox, dpr * this.oy);

    ctx.fillStyle = '#121824';
    ctx.fillRect(0, 0, cfg.fieldW, cfg.fieldH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cfg.fieldW, cfg.fieldH);
    ctx.clip();

    // зоны
    for (const z of world.zones) {
      const zt = ZONE_TYPES[z.type];
      ctx.fillStyle = zt.fill;
      ctx.strokeStyle = zt.stroke;
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([6 / scale, 5 / scale]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // кусты еды: яркость = «здоровье»
    for (const p of world.patches) {
      ctx.strokeStyle = `rgba(95,207,128,${0.12 + 0.3 * p.health})`;
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cfg.patchRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = '#2f3a4f';
    ctx.strokeRect(0, 0, cfg.fieldW, cfg.fieldH);

    // еда
    ctx.fillStyle = '#5fcf80';
    ctx.beginPath();
    const fr = cfg.foodRadius;
    for (const f of world.foods) {
      const r = f.e > cfg.foodEnergy * 1.05 || f.e < cfg.foodEnergy * 0.95 ? fr * 0.8 : fr;
      ctx.moveTo(f.x + r, f.y);
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    // следы
    if (this.trails.size) {
      ctx.lineWidth = 1.2 / scale;
      for (const [id, t] of this.trails) {
        if (t.length < 4) continue;
        const b = world.bacteria.find((x) => x.id === id);
        ctx.strokeStyle = b ? this.colorOf(b, o.color, world) : '#fff';
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(t[0], t[1]);
        for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // линии зрения
    if (o.vision) {
      ctx.strokeStyle = 'rgba(95,207,128,0.35)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (const b of world.bacteria) {
        if (!b.seesFood || !inFocus(b, o.focus)) continue;
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.foodX, b.foodY);
      }
      ctx.stroke();
    }

    // бактерии: сначала «приглушённые», потом в фокусе
    const passes = o.focus ? [false, true] : [true];
    for (const focused of passes) {
      ctx.globalAlpha = focused ? 1 : 0.13;
      for (const b of world.bacteria) {
        if (o.focus && inFocus(b, o.focus) !== focused) continue;
        const R = world.radiusOf(b);
        ctx.fillStyle = this.colorOf(b, o.color, world);
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1, 1.2 / scale);
      ctx.beginPath();
      for (const b of world.bacteria) {
        if (o.focus && inFocus(b, o.focus) !== focused) continue;
        const R = world.radiusOf(b);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + Math.cos(b.angle) * R * 1.5, b.y + Math.sin(b.angle) * R * 1.5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // выбранная
    const s = o.selected;
    if (s && world.bacteria.includes(s)) {
      const R = world.radiusOf(s);
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + 4 / scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, world.visionOf(s), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.seesFood) {
        ctx.strokeStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.foodX, s.foodY);
        ctx.stroke();
      }
    }
  }

  colorOf(b: Bacterium, mode: ColorMode, world: World): string {
    switch (mode) {
      case 'energy':
        return `hsl(${Math.round(Math.min(1, Math.max(0, b.energy / world.maxEnergyOf(b))) * 120)} 75% 52%)`;
      case 'generation': {
        const mg = world.totals.maxGen;
        const t = mg > 0 ? b.generation / mg : 0;
        return `hsl(${Math.round(230 - t * 230)} 75% 55%)`;
      }
      case 'size': {
        const t = Math.min(1, Math.max(0, (b.genome.traits.size - 0.5) / 1.5));
        return `hsl(${Math.round(200 - t * 180)} 70% ${45 + t * 15}%)`;
      }
      case 'lineage':
        return `hsl(${Math.round(b.genome.hue * 360)} 70% 58%)`;
      default:
        return TYPES[b.type].color;
    }
  }

  /** Ближайшая бактерия к точке экрана (или null). */
  pick(world: World, sx: number, sy: number): Bacterium | null {
    const [wx, wy] = this.toWorld(sx, sy);
    let best: Bacterium | null = null;
    let bd = Infinity;
    for (const b of world.bacteria) {
      const reach = Math.max(world.radiusOf(b) * 1.6, 10 / this.scale);
      const d = (b.x - wx) ** 2 + (b.y - wy) ** 2;
      if (d < reach * reach && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
}
