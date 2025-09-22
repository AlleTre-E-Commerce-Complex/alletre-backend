// src/app-version/semver.util.ts
// lightweight semver compare: returns -1 if a<b, 0 if equal, 1 if a>b
export function compareSemver(a: string, b: string): number {
  const norm = (v: string) => v.split('.').map(x => parseInt(x || '0', 10));
  const A = norm(a);
  const B = norm(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const ai = A[i] ?? 0;
    const bi = B[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

export function isLessThan(a: string, b: string) {
  return compareSemver(a, b) === -1;
}
