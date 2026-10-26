// Linear expressions over the unknowns: sum(coeff * x[idx]) + k. Elements describe the
// current entering each of their pins this way; the assembler stamps KCL from those
// expressions and the results are read back from the same ones, so stamping and reporting
// can never disagree about a sign.

export class Lin {
  constructor(F) { this.F = F; this.t = []; this.k = F.zero; }

  add(idx, c) {
    if (idx !== null && idx !== undefined && !this.F.isZero(c)) this.t.push([idx, c]);
    return this;
  }

  addK(c) { if (!this.F.isZero(c)) this.k = this.F.add(this.k, c); return this; }

  plus(other, c = this.F.one) {
    const F = this.F;
    for (const [i, a] of other.t) this.add(i, F.mul(a, c));
    return this.addK(F.mul(other.k, c));
  }

  scaled(c) { return new Lin(this.F).plus(this, c); }

  neg() { return this.scaled(this.F.neg(this.F.one)); }

  eval(x) {
    const F = this.F;
    let s = this.k;
    for (const [i, a] of this.t) s = F.add(s, F.mul(a, x[i]));
    return s;
  }
}

export const lin = (F) => new Lin(F);

// v(a) - v(b) as an expression, given the builder's node -> unknown map
export function vdiff(s, a, b) {
  const F = s.F;
  return lin(F).add(s.n(a), F.one).add(s.n(b), F.neg(F.one));
}
