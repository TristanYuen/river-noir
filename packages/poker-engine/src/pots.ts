import type { Pot, TablePlayer } from "./types.js";

export function buildPots(players: readonly TablePlayer[]): Pot[] {
  const contributors = players.filter((player) => player.committedHand > 0);
  const levels = [...new Set(contributors.map((player) => player.committedHand))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const involved = contributors.filter((player) => player.committedHand >= level);
    const amount = (level - previousLevel) * involved.length;
    if (amount > 0) {
      pots.push({
        amount,
        eligiblePlayerIds: involved
          .filter((player) => player.status !== "folded")
          .map((player) => player.id),
      });
    }
    previousLevel = level;
  }

  return pots;
}
