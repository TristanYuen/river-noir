import type { RandomSource } from "@river-noir/poker-engine";

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }
}
