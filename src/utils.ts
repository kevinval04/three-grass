export function biasedRandomScale(min: number, max: number): number {
  return min + (max - min) * Math.pow(Math.random(), 2);
}