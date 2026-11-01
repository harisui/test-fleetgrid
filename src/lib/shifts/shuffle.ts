/** The most drivers one broadcast round texts (T3.4). */
export const BROADCAST_CAP = 200;

/**
 * A fresh random order (Fisher-Yates), then the cap (client decision of 2026-10-05: random,
 * shuffled anew for every broadcast, before the 200 cap, so nobody is always first or always
 * left out). The source of randomness is injectable for tests.
 */
export function shuffleAndCap<T>(items: readonly T[], random: () => number = Math.random, cap = BROADCAST_CAP): T[] {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, cap);
}
