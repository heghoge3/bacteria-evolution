/** Минимальная типизированная шина событий. */
export class Emitter<E extends object> {
  private map = new Map<keyof E, Set<(p: never) => void>>();

  on<K extends keyof E>(kind: K, fn: (payload: E[K]) => void): () => void {
    let set = this.map.get(kind);
    if (!set) this.map.set(kind, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set.delete(fn as (p: never) => void);
  }

  has(kind: keyof E): boolean {
    return (this.map.get(kind)?.size ?? 0) > 0;
  }

  emit<K extends keyof E>(kind: K, payload: E[K]): void {
    const set = this.map.get(kind);
    if (!set) return;
    for (const fn of set) (fn as (p: E[K]) => void)(payload);
  }
}
