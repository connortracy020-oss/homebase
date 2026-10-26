// Dense LU with partial pivoting. Student circuits have well under 100 unknowns, so dense
// is faster than sparse and simple enough to trust. Rows are equilibrated (scaled by their
// largest entry) before pivoting so a 1 pF capacitor and a 1 MΩ resistor can share a matrix.

export class Singular extends Error {
  constructor(col) {
    super("the circuit's equations have no unique solution");
    this.name = "Singular";
    this.col = col;  // the unknown that couldn't be determined
  }
}

const TOL = 1e-12;  // on equilibrated rows: a pivot this small means "no unique solution"

// Solve A x = b over a field (see field.js). A is an array of rows; neither input is changed.
export function solveField(F, A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  const scale = F.exact ? null : M.map((row) => Math.max(...row.slice(0, n).map(Math.abs)) || 1);
  const perm = [...Array(n).keys()];
  for (let k = 0; k < n; k++) {
    let best = -1, bestMag = -1;
    for (let i = k; i < n; i++) {
      if (F.isZero(M[i][k])) continue;
      const m = F.mag(M[i][k]) / (scale ? scale[perm[i]] : 1);
      if (m > bestMag) { bestMag = m; best = i; }
    }
    if (best < 0 || (scale && bestMag < TOL)) throw new Singular(k);
    if (best !== k) { [M[k], M[best]] = [M[best], M[k]]; [perm[k], perm[best]] = [perm[best], perm[k]]; }
    const pivot = M[k][k];
    for (let i = k + 1; i < n; i++) {
      if (F.isZero(M[i][k])) continue;
      const f = F.div(M[i][k], pivot);
      const Ri = M[i], Rk = M[k];
      Ri[k] = F.zero;
      for (let j = k + 1; j <= n; j++) if (!F.isZero(Rk[j])) Ri[j] = F.sub(Ri[j], F.mul(f, Rk[j]));
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) if (!F.isZero(M[i][j])) s = F.sub(s, F.mul(M[i][j], x[j]));
    x[i] = F.div(s, M[i][i]);
  }
  return x;
}

// Floating-point factorization reused across many right-hand sides (transient steps,
// where the matrix stays the same as long as the step size and topology do).
export function factor(A, n) {
  const lu = Float64Array.from(A), piv = new Int32Array(n), scale = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = 0; j < n; j++) m = Math.max(m, Math.abs(lu[i * n + j]));
    scale[i] = m || 1;
  }
  for (let k = 0; k < n; k++) {
    let best = k, bestMag = Math.abs(lu[k * n + k]) / scale[k];
    for (let i = k + 1; i < n; i++) {
      const m = Math.abs(lu[i * n + k]) / scale[i];
      if (m > bestMag) { bestMag = m; best = i; }
    }
    if (bestMag < TOL) throw new Singular(k);
    piv[k] = best;
    if (best !== k) {
      for (let j = 0; j < n; j++) { const t = lu[k * n + j]; lu[k * n + j] = lu[best * n + j]; lu[best * n + j] = t; }
      const t = scale[k]; scale[k] = scale[best]; scale[best] = t;
    }
    const p = lu[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = (lu[i * n + k] /= p);
      if (f !== 0) for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
    }
  }
  return { lu, piv, n };
}

export function solveFactored({ lu, piv, n }, b) {
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    const p = piv[k];
    if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; }
    for (let i = k + 1; i < n; i++) x[i] -= lu[i * n + k] * x[k];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
    x[i] = s / lu[i * n + i];
  }
  return x;
}
