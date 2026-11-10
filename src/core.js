"use strict";
/* =====================================================================
   MATH DUEL - math engine (problems, step-by-step solutions, grading)
   Same rules as the Python version:
     +1 correct, +1/2 sign slip (dropped negative, > < = mixed up, ( vs [ ),
     unreadable answers are not graded.
   ===================================================================== */

// ---------------------------------------------------------------- fractions
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

class Frac {
  constructor(n, d = 1) {
    if (d === 0) throw new Error("division by zero");
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    this.n = n / g + 0;
    this.d = d / g;
  }
  add(o) { o = F(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = F(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = F(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { o = F(o); return new Frac(this.n * o.d, this.d * o.n); }
  neg() { return new Frac(-this.n, this.d); }
  abs() { return new Frac(Math.abs(this.n), this.d); }
  pow(k) {
    let r = F(1);
    const base = k < 0 ? new Frac(this.d, this.n) : this;
    for (let i = 0; i < Math.abs(k); i++) r = r.mul(base);
    return r;
  }
  cmp(o) { o = F(o); return Math.sign(this.n * o.d - o.n * this.d); }
  eq(o) { return o instanceof Frac || typeof o === "number" ? this.cmp(o) === 0 : false; }
  lt(o) { return this.cmp(o) < 0; }
  gt(o) { return this.cmp(o) > 0; }
  le(o) { return this.cmp(o) <= 0; }
  ge(o) { return this.cmp(o) >= 0; }
  isZero() { return this.n === 0; }
  valueOf() { return this.n / this.d; }
  toString() { return fmt(this); }
}
function F(x, d) { return x instanceof Frac ? x : new Frac(x, d === undefined ? 1 : d); }
function fmt(x) { x = F(x); return x.d === 1 ? String(x.n) : `${x.n}/${x.d}`; }

function parseFrac(s) {
  s = String(s).trim();
  let m = /^([+-]?)(\d+)\/(\d+)$/.exec(s);
  if (m) {
    if (+m[3] === 0) return null;
    return new Frac((m[1] === "-" ? -1 : 1) * parseInt(m[2], 10), parseInt(m[3], 10));
  }
  m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (m && (m[2] || m[3])) {
    const fp = (m[3] || "").slice(0, 9);
    const den = Math.pow(10, fp.length);
    const num = parseInt(m[2] || "0", 10) * den + (fp ? parseInt(fp, 10) : 0);
    return new Frac((m[1] === "-" ? -1 : 1) * num, den);
  }
  return null;
}

// ---------------------------------------------------------------- random helpers
const R = {
  int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
  random: () => Math.random(),
  sample(arr, k) { const a = arr.slice(); const out = []; for (let i = 0; i < k; i++) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; },
  uniform: (a, b) => a + Math.random() * (b - a),
};
function nz(lo, hi) { const c = []; for (let i = lo; i <= hi; i++) if (i !== 0) c.push(i); return R.choice(c); }
function range(a, b) { const out = []; for (let i = a; i < b; i++) out.push(i); return out; }

// ---------------------------------------------------------------- formatting helpers
function poly(coeffs, v = "x") {
  const out = [];
  const n = coeffs.length - 1;
  coeffs.forEach((co, i) => {
    co = F(co);
    if (co.isZero()) return;
    const deg = n - i;
    const mag = co.abs();
    const num = (mag.eq(1) && deg > 0) ? "" : fmt(mag);
    const vv = deg === 0 ? "" : (deg === 1 ? v : `${v}^${deg}`);
    const term = num + vv;
    if (!out.length) out.push((co.lt(0) ? "-" : "") + term);
    else out.push((co.lt(0) ? " - " : " + ") + term);
  });
  return out.join("") || "0";
}
function ev(coeffs, x) { let t = 0; for (const c of coeffs) t = t * x + c; return t; }
function paren(n) { n = F(n); return n.lt(0) ? `(${fmt(n)})` : fmt(n); }
function pm(v) { v = F(v); return v.lt(0) ? `- ${fmt(v.neg())}` : `+ ${fmt(v)}`; }
function coef(a) { return a === 1 ? "" : a === -1 ? "-" : fmt(a); }
function steps(lines, answer) {
  const out = lines.map((l, i) => `Step ${i + 1}: ${l}`);
  if (answer !== undefined && answer !== null) out.push(`Answer: ${answer}`);
  return out.join("\n");
}
function gfmt(x) { return String(parseFloat(x.toPrecision(6))); }
function money(x) { return "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function commas(x) { return x.toLocaleString("en-US"); }
function P(topic, q, ans, kind, sol, base) { return { topic, q, ans, kind, sol, base }; }

// ---------------------------------------------------------------- problem generators
function g_rational(t) {
  const Rr = { 1: 4, 2: 6, 3: 9 }[t];
  let r, cc, d, den, k, a, b;
  for (;;) {
    r = R.int(-Rr, Rr);
    cc = t < 3 ? R.int(1, 3) : nz(-3, 3);
    d = R.int(-6, 6);
    den = cc * r + d;
    if (den === 0) continue;
    k = nz(-5, 5);
    a = t === 1 ? R.int(1, 5) : nz(-5, 5);
    if (a === k * cc) continue;
    b = k * den - a * r;
    if (Math.abs(b) > 25) continue;
    break;
  }
  const top = poly([a, b], "r"), bot = poly([cc, d], "r");
  const q = `Let f(x) = (${poly([a, b])}) / (${poly([cc, d])}).\nFind the real number r such that f(r) = ${k}.`;
  const sol = steps([
    `Put r into the fraction and set it equal to ${k}:   (${top}) / (${bot}) = ${k}`,
    `Multiply both sides by the bottom, (${bot}):   ${top} = ${k}(${bot})`,
    `Multiply out the right side:   ${top} = ${poly([k * cc, k * d], "r")}`,
    `Move the r terms to the left and the plain numbers to the right:   ${poly([a - k * cc, 0], "r")} = ${fmt(k * d - b)}`,
    `Divide both sides by ${fmt(a - k * cc)}:   r = ${r}`,
    `Check: the bottom is ${poly([cc, d], "r")} = ${den} when r = ${r}, not 0, so r = ${r} is allowed.`,
  ], `r = ${r}`);
  return P("Rational equation", q, F(r), "num", sol, 30);
}

function g_shift(t) {
  const m = t === 3 ? 2 : 1;
  const h = t === 1 ? R.int(1, 4) : nz(-5, 5);
  const p = R.int(-6, 6), qq = R.int(-9, 9);
  let n;
  for (;;) { n = R.int(-4, 6); if ((n - h) % m === 0 && n - h !== 0) break; }
  const x0 = (n - h) / m;
  const ans = x0 * x0 + p * x0 + qq;
  const inside = poly([m, h]);
  const q = `If f(${inside}) = ${poly([1, p, qq])}, find f(${n}).`;
  const sol = steps([
    `f( ) works on whatever is inside the parentheses. We need the inside, ${inside}, to equal ${n}.`,
    `Solve ${inside} = ${n}:   x = ${x0}`,
    `Put x = ${x0} into the right side:   (${x0})^2 ${pm(p)}(${x0}) ${pm(qq)}`,
    `Work it out:   ${x0 * x0} ${pm(p * x0)} ${pm(qq)} = ${ans}`,
  ], `f(${n}) = ${ans}`);
  return P("Shifted input", q, F(ans), "num", sol, 25);
}

function g_domain(t) {
  const k = R.int(2, 9);
  const rule = "You can't take the square root of a negative number, so the inside must be 0 or more.";
  let q, ans, sol;
  if (t === 1) {
    q = `What is the domain of f(x) = sqrt(${k * k} - x^2)?`;
    ans = `[-${k},${k}]`;
    sol = steps([rule, `Write that down:   ${k * k} - x^2 >= 0`, `Add x^2 to both sides:   x^2 <= ${k * k}`,
      `x^2 is at most ${k * k} when x is between -${k} and ${k}:   -${k} <= x <= ${k}`,
      "Both ends are included (the inside can equal 0), so use square brackets [ ]."], `[-${k}, ${k}]`);
  } else if (t === 2) {
    const a = R.int(1, 9);
    if (R.random() < 0.5) {
      const s = R.choice([1, -1]);
      const inside = poly([1, -s * a]);
      q = `What is the domain of f(x) = sqrt(${inside})?`;
      ans = `[${s * a},inf)`;
      sol = steps([rule, `Write that down:   ${inside} >= 0`, `Solve for x:   x >= ${s * a}`,
        `So x starts at ${s * a} (included, so [ ) and goes on forever to the right.`,
        "Infinity is never a real number you can reach, so it always gets a round bracket )."], `[${s * a}, inf)`);
    } else {
      q = `What is the domain of f(x) = sqrt(${a} - x)?`;
      ans = `(-inf,${a}]`;
      sol = steps([rule, `Write that down:   ${a} - x >= 0`, `Add x to both sides:   ${a} >= x,  which is the same as  x <= ${a}`,
        `So x comes from far left (-inf, always a round bracket) up to ${a} (included, so ]).`], `(-inf, ${a}]`);
    }
  } else if (R.random() < 0.5) {
    q = `What is the domain of f(x) = sqrt(x^2 - ${k * k})?`;
    ans = `(-inf,-${k}]u[${k},inf)`;
    sol = steps([rule, `Write that down:   x^2 - ${k * k} >= 0,  so  x^2 >= ${k * k}`,
      `x^2 is at least ${k * k} when x is far from 0:   x <= -${k}  OR  x >= ${k}`,
      `That's two separate pieces: (-inf, -${k}] and [${k}, inf).`, "Join two pieces with U (it means 'or')."],
      `(-inf, -${k}] U [${k}, inf)`);
  } else {
    q = `What is the domain of f(x) = 1 / sqrt(${k * k} - x^2)?`;
    ans = `(-${k},${k})`;
    sol = steps(["Two rules: the inside of a square root can't be negative, AND the bottom of a fraction can't be 0.",
      `Together that means the inside must be MORE than 0:   ${k * k} - x^2 > 0`,
      `So x^2 < ${k * k}, which means   -${k} < x < ${k}`,
      `The ends -${k} and ${k} would make the bottom 0, so they're NOT included: use round brackets ( ).`], `(-${k}, ${k})`);
  }
  return P("Domain", q, ans, "interval", sol, 25);
}

function g_piece_inverse(t) {
  const cpt = R.int(-3, 3);
  const m1 = t === 1 ? 1 : R.int(1, 3), m2 = t === 1 ? 1 : R.int(1, 3);
  const b1 = R.int(-5, 5);
  const b2 = m1 * cpt + b1 - m2 * cpt + R.int(0, 3);
  const piece = t === 1 ? 2 : R.choice([1, 2]);
  let x0, y;
  if (piece === 1) { x0 = cpt - R.int(1, 4); y = m1 * x0 + b1; } else { x0 = cpt + R.int(0, 4); y = m2 * x0 + b2; }
  const q = `Let g(x) = ${poly([m1, b1])}   if x < ${cpt}\n     g(x) = ${poly([m2, b2])}   if x >= ${cpt}\nFind g^-1(${y}).`;
  const x1 = F(y - b1, m1), x2 = F(y - b2, m2);
  const ok1 = x1.lt(cpt), ok2 = x2.ge(cpt);
  const sol = steps([
    `g^-1(${y}) asks: which x makes g(x) = ${y}? Try each rule.`,
    `Top rule: ${poly([m1, b1])} = ${y}  gives  x = ${fmt(x1)}.  The top rule only counts when x < ${cpt}. ` + (ok1 ? "Yes, it fits - keep it." : "It doesn't fit - throw it out."),
    `Bottom rule: ${poly([m2, b2])} = ${y}  gives  x = ${fmt(x2)}.  The bottom rule only counts when x >= ${cpt}. ` + (ok2 ? "Yes, it fits - keep it." : "It doesn't fit - throw it out."),
  ], `g^-1(${y}) = ${x0}`);
  return P("Piecewise inverse", q, F(x0), "num", sol, 35);
}

function g_composition(t) {
  let x0 = R.int(-2, 3), q, sol, ans;
  if (t === 1) {
    const a = nz(-4, 4), b = R.int(-5, 5), cc = nz(-4, 4), d = R.int(-5, 5);
    const inner = cc * x0 + d;
    ans = a * inner + b;
    q = `Let p(x) = ${poly([a, b])} and q(x) = ${poly([cc, d])}. Find p(q(${x0})).`;
    sol = steps([`p(q(${x0})) means: do q first, then put that answer into p. Start inside.`,
      `q(${x0}) = ${coef(cc)}(${x0}) ${pm(d)} = ${inner}`,
      `Now put ${inner} into p:   p(${inner}) = ${coef(a)}(${inner}) ${pm(b)} = ${ans}`], `${ans}`);
  } else {
    let qc, rc;
    if (t === 2) { qc = [nz(-3, 3), R.int(-4, 4)]; rc = [R.int(-3, 3), R.int(-5, 5), R.int(-5, 5)]; }
    else { qc = [nz(-2, 2), 0, 0, R.int(-3, 3)]; rc = [nz(-7, 7), R.int(-5, 5), 0, R.int(-6, 6), R.int(-5, 5)]; x0 = R.int(-2, 2); }
    const inner = ev(qc, x0), rv = ev(rc, x0);
    ans = inner * inner + rv;
    q = `Let p(x) = x^2, q(x) = ${poly(qc)}, r(x) = ${poly(rc)}.\nFind p(q(${x0})) + r(${x0}).`;
    sol = steps([`Work from the inside out. Put x = ${x0} into q(x):   q(${x0}) = ${inner}`,
      `p squares whatever you give it:   p(${inner}) = (${inner})^2 = ${inner * inner}`,
      `Put x = ${x0} into r(x):   r(${x0}) = ${rv}`,
      `Add the two parts:   ${inner * inner} ${pm(rv)} = ${ans}`], `${ans}`);
  }
  return P("Composition", q, F(ans), "num", sol, 35);
}

function g_exponent(t) {
  const b = R.choice(t === 1 ? [2, 3] : [2, 3, 5]);
  const v = R.choice(range(3, 10).filter((x) => x !== b && x !== b * b));
  let m, n;
  if (t === 1) { m = 1; n = R.int(1, 3); } else if (t === 2) { m = 2; n = R.int(-1, 3); } else { m = R.choice([2, 3, -1, -2]); n = R.int(-2, 3); }
  const vm = F(v).pow(m), bn = F(b).pow(n), ans = vm.mul(bn);
  const q = `If ${b}^x = ${v}, what is the value of ${b}^(${poly([m, n])})?`;
  const neg = "   (a negative power means 1 over it)";
  const swap = `Rewrite ${b}^(${poly([m, 0])}) as (${b}^x)^(${m}), and swap in ${b}^x = ${v}:   (${v})^(${m}) = ${fmt(vm)}` + (m < 0 ? neg : "");
  const sol = n === 0 ? steps([swap], fmt(ans)) : steps([
    `Split the exponent with the rule  b^(m + n) = b^m * b^n:   ${b}^(${poly([m, n])}) = ${b}^(${poly([m, 0])}) * ${b}^(${n})`,
    swap, `Work out ${b}^(${n}) = ${fmt(bn)}` + (n < 0 ? neg : ""), `Multiply:   ${fmt(vm)} * ${fmt(bn)} = ${fmt(ans)}`], fmt(ans));
  return P("Exponent rules", q, ans, "num", sol, 30);
}

function g_log(t) {
  const b = t > 1 ? R.choice([2, 3, 5]) : R.int(2, 5);
  const n = R.int(2, 5);
  let q, ans, sol;
  if (t === 1) {
    q = `What is the value of log base ${b} of ${Math.pow(b, n)}?`;
    ans = F(n);
    sol = steps([`log base ${b} of ${Math.pow(b, n)} asks:  ${b} to what power gives ${Math.pow(b, n)}?`,
      `${Array(n).fill(String(b)).join(" * ")} = ${Math.pow(b, n)},  so  ${b}^${n} = ${Math.pow(b, n)}`], `${n}`);
  } else if (t === 2) {
    q = `What is the value of log base sqrt(${b}) of (${b}^${n})?`;
    ans = F(2 * n);
    sol = steps([`The question asks:  sqrt(${b}) to what power y gives ${b}^${n}?`,
      `Write sqrt(${b}) as a power of ${b}:   sqrt(${b}) = ${b}^(1/2)`,
      `Then (sqrt(${b}))^y = ${b}^(y/2). The powers must match:   y/2 = ${n}`,
      `Multiply both sides by 2:   y = ${2 * n}`], `${2 * n}`);
  } else {
    const kind = R.choice(["cube", "power", "recip", "sqrt_recip"]);
    if (kind === "cube") {
      q = `What is the value of log base cbrt(${b}) of (${b}^${n})?   (cbrt = cube root)`;
      ans = F(3 * n);
      sol = steps([`The question asks:  cbrt(${b}) to what power y gives ${b}^${n}?`,
        `Write the cube root as a power:   cbrt(${b}) = ${b}^(1/3)`,
        `Then (cbrt(${b}))^y = ${b}^(y/3). The powers must match:   y/3 = ${n}`,
        `Multiply both sides by 3:   y = ${3 * n}`], `${3 * n}`);
    } else if (kind === "power") {
      const p = R.choice([2, 3]);
      q = `What is the value of log base ${Math.pow(b, p)} of (${b}^${n})?`;
      ans = F(n, p);
      sol = steps([`The question asks:  ${Math.pow(b, p)} to what power y gives ${b}^${n}?`,
        `Write ${Math.pow(b, p)} as a power of ${b}:   ${Math.pow(b, p)} = ${b}^${p}`,
        `Then (${b}^${p})^y = ${b}^(${p}y). The powers must match:   ${p}y = ${n}`,
        `Divide both sides by ${p}:   y = ${fmt(ans)}`], fmt(ans));
    } else if (kind === "recip") {
      q = `What is the value of log base (1/${b}) of (${b}^${n})?`;
      ans = F(-n);
      sol = steps([`The question asks:  1/${b} to what power y gives ${b}^${n}?`,
        `Write 1/${b} as a power of ${b}:   1/${b} = ${b}^(-1)`,
        `Then (1/${b})^y = ${b}^(-y). The powers must match:   -y = ${n}`,
        `So y = ${-n}. The answer is NEGATIVE - don't drop the minus sign.`], `${-n}`);
    } else {
      q = `What is the value of log base sqrt(${b}) of (1/${b}^${n})?`;
      ans = F(-2 * n);
      sol = steps([`Write both parts as powers of ${b}:   sqrt(${b}) = ${b}^(1/2)   and   1/${b}^${n} = ${b}^(-${n})`,
        `Then (sqrt(${b}))^y = ${b}^(y/2). The powers must match:   y/2 = -${n}`,
        `Multiply both sides by 2:   y = ${-2 * n}   (negative!)`], `${-2 * n}`);
    }
  }
  return P("Logarithms", q, ans, "num", sol, 25);
}

function g_interest(t) {
  const who = R.choice(["Joseph", "Maya", "Diego", "Aisha", "Ken", "Lucia"]);
  let P0, r, n, label, yrs;
  if (t === 1) { P0 = R.choice(range(1000, 5001).filter((x) => x % 500 === 0)); r = R.choice([4, 5, 6, 8, 10]); n = 1; label = "once a year"; yrs = R.int(1, 3); }
  else if (t === 2) { P0 = R.choice([2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]); r = R.choice([4, 6, 8, 10, 12]); [n, label] = R.choice([[2, "twice a year"], [4, "quarterly"]]); yrs = R.int(1, 2); }
  else { P0 = R.choice([5000, 8000, 10000, 12000, 15000]); r = R.choice([3, 4.5, 6, 7.2, 9]); [n, label] = R.choice([[4, "quarterly"], [12, "monthly"]]); yrs = R.int(2, 5); }
  const amt = Math.round((P0 * Math.pow(1 + r / 100 / n, n * yrs) + 1e-9) * 100) / 100;
  const months = yrs * 12, rate = gfmt(r / 100), growth = gfmt(1 + r / 100 / n);
  const q = `${who} borrows $${commas(P0)} at an annual interest rate of ${r}%, compounded ${label}.\nHow much is owed after ${months} months? (nearest cent)`;
  const sol = steps(["Use the compound interest formula:   A = P(1 + r/n)^(n*t)",
    `Fill in the pieces:  P = ${P0} (the starting amount),  r = ${rate} (${r}% as a decimal),  n = ${n} (interest is added ${label}),  t = ${yrs} (since ${months} months = ${yrs} year${yrs > 1 ? "s" : ""})`,
    `Each time interest is added, the amount is multiplied by 1 + ${rate}/${n} = ${growth}`,
    `That happens n*t = ${n} * ${yrs} = ${n * yrs} times:   A = ${P0} * (${growth})^${n * yrs}`,
    `Work it out and round to the nearest cent:   A = ${money(amt)}`], money(amt));
  return P("Compound interest", q, amt, "money", sol, 40);
}

function sortFracs(arr) { return arr.slice().sort((a, b) => a.cmp(b)); }
function uniqFracs(arr) { const s = sortFracs(arr); return s.filter((v, i) => i === 0 || !v.eq(s[i - 1])); }

function solveAbsPlus(a, cc) {
  const sols = [];
  if (a !== -1) { const x = F(cc, 1 + a); if (x.ge(0)) sols.push(x); }
  if (a !== 1) { const x = F(cc, a - 1); if (x.lt(0)) sols.push(x); }
  return uniqFracs(sols);
}

function g_abs(t) {
  let q, sol, sols;
  if (t < 3) {
    let a, b, k;
    if (t === 1) { a = 1; b = R.int(-6, 6); k = R.int(1, 8); } else { a = R.choice([2, 3]); b = R.int(-6, 6); k = R.int(1, 9); }
    const inside = poly([a, b]);
    const s1 = F(k - b, a), s2 = F(-k - b, a);
    sols = uniqFracs([s1, s2]);
    q = `Find all x that satisfy |${inside}| = ${k}.`;
    sol = steps([`Absolute value is distance from 0, so the inside is either ${k} or -${k}. Solve both.`,
      `Case 1:   ${inside} = ${k}   ->   x = ${fmt(s1)}`, `Case 2:   ${inside} = -${k}   ->   x = ${fmt(s2)}`],
      sols.map(fmt).join(", "));
  } else {
    let a, cc;
    for (;;) { a = R.choice([-3, -2, 2, 3]); cc = nz(-9, 9); sols = solveAbsPlus(a, cc); if (sols.every((s) => s.d <= 4)) break; }
    q = `Find all x that satisfy |x| ${a > 0 ? "+" : "-"} ${Math.abs(a)}x = ${cc}.`;
    const x1 = F(cc, 1 + a), x2 = F(cc, a - 1);
    sol = steps(["|x| acts differently for positive and negative x, so split into two cases.",
      `Case x >= 0: here |x| = x, so  x ${pm(a)}x = ${cc}  ->  ${fmt(1 + a)}x = ${cc}  ->  x = ${fmt(x1)}. ` + (x1.ge(0) ? "It IS >= 0, so keep it." : "But that's NOT >= 0, so throw it out."),
      `Case x < 0: here |x| = -x, so  -x ${pm(a)}x = ${cc}  ->  ${fmt(a - 1)}x = ${cc}  ->  x = ${fmt(x2)}. ` + (x2.lt(0) ? "It IS < 0, so keep it." : "But that's NOT < 0, so throw it out.")],
      sols.length ? sols.map(fmt).join(", ") : "none (no solution)");
  }
  return P("Absolute value", q, sols, "list", sol, 35);
}

function g_arith_sum(t) {
  let a1, d, n;
  if (t === 1) { a1 = R.int(1, 10); d = R.int(1, 3); n = R.int(5, 10); }
  else if (t === 2) { a1 = R.int(5, 50); d = R.int(2, 5); n = R.int(15, 30); }
  else { a1 = R.int(100, 200); d = R.int(3, 7); n = R.int(60, 120); }
  const an = a1 + (n - 1) * d, S = n * (a1 + an) / 2;
  const q = `Calculate the sum:  ${a1} + ${a1 + d} + ${a1 + 2 * d} + ... + ${an - d} + ${an}`;
  const sol = steps([`Each number is ${d} more than the one before, so the common difference is ${d}.`,
    `Count the terms:   (last - first) / difference + 1  =  (${an} - ${a1}) / ${d} + 1  =  ${n} terms`,
    `Add the first and last:   ${a1} + ${an} = ${a1 + an}.  Every pair from the outside in adds to this too.`,
    `Sum = (number of terms) * (first + last) / 2  =  ${n} * ${a1 + an} / 2  =  ${S}`], `${S}`);
  return P("Arithmetic series", q, F(S), "num", sol, 40);
}

function g_geometric(t) {
  let q, sol, ans;
  if (t === 1) {
    const a1 = R.int(1, 5), r = R.int(2, 3), k = R.int(4, 6);
    ans = a1 * Math.pow(r, k - 1);
    q = `A geometric sequence has first term ${a1} and common ratio ${r}. What is term #${k}?`;
    const terms = range(0, k).map((i) => a1 * Math.pow(r, i));
    sol = steps([`Geometric means you multiply by the ratio, ${r}, each time.`,
      `Term #${k} = first * ratio^(${k} - 1) = ${a1} * ${r}^${k - 1}`, `Or just list them:   ${terms.join(", ")}`], `${ans}`);
  } else if (t === 2) {
    const a1 = R.int(1, 6), r = R.int(2, 4), a4 = a1 * r * r * r;
    ans = a1 * r;
    q = `A geometric sequence is made of positive numbers. The first term is ${a1} and the fourth term is ${a4}. What is the second term?`;
    sol = steps([`Going from term #1 to term #4 multiplies by the ratio 3 times:   ${a1} * r^3 = ${a4}`,
      `Divide by ${a1}:   r^3 = ${r * r * r}`, `Take the cube root:   r = ${r}`, `Term #2 = ${a1} * ${r} = ${ans}`], `${ans}`);
  } else {
    const a1 = R.int(1, 7), s = R.choice([2, 3]), m = R.choice([2, 4]);
    const n = 2 * m + 1, an = a1 * Math.pow(s, m), half = Math.pow(s, m / 2);
    ans = a1 * half;
    q = `A geometric sequence is made of positive numbers. The first term is ${a1} and term #${n} is ${an}. What is term #${m + 1}?`;
    sol = steps([`Going from term #1 to term #${n} multiplies by the ratio ${n - 1} times:   ${a1} * r^${n - 1} = ${an}`,
      `Divide by ${a1}:   r^${n - 1} = ${Math.pow(s, m)}`,
      `Term #${m + 1} is ${m} steps after term #1, so we need r^${m}. Since r^${n - 1} = (r^${m})^2,  r^${m} = sqrt(${Math.pow(s, m)}) = ${half}`,
      `Term #${m + 1} = ${a1} * ${half} = ${ans}`], `${ans}`);
  }
  return P("Geometric sequence", q, F(ans), "num", sol, 35);
}

function g_degree(t) {
  const [m, n] = R.sample(range(2, 8), 2);
  const which = t === 1 ? R.choice(["sum", "prod"]) : t === 2 ? R.choice(["sum", "prod", "square"]) : R.choice(["compose", "mix"]);
  const hi = Math.max(m, n);
  let q, sol, ans;
  if (which === "sum") {
    ans = hi;
    q = `deg f(x) = ${m} and deg g(x) = ${n}. Find the degree of f(x) + g(x).`;
    sol = steps(["The degree is the highest power of x.",
      `When you add, the x^${hi} term has nothing to cancel with (g and f have different top powers).`,
      `So the highest power is still x^${hi}.`], `${ans}`);
  } else if (which === "prod") {
    ans = m + n;
    q = `deg f(x) = ${m} and deg g(x) = ${n}. Find the degree of f(x) * g(x).`;
    sol = steps(["The degree is the highest power of x.",
      `Multiply the highest terms:   x^${m} * x^${n} = x^(${m} + ${n}) = x^${m + n}   (powers ADD when you multiply)`], `${ans}`);
  } else if (which === "square") {
    ans = 2 * m;
    q = `deg f(x) = ${m}. Find the degree of (f(x))^2 + x.`;
    sol = steps([`Squaring the highest term:   (x^${m})^2 = x^${2 * m}   (powers MULTIPLY)`,
      `Adding x doesn't matter, since x^${2 * m} is a higher power.`], `${ans}`);
  } else if (which === "compose") {
    ans = m * n;
    q = `deg f(x) = ${m} and deg g(x) = ${n}. Find the degree of f(g(x)).`;
    sol = steps(["f(g(x)) means put g(x) in place of x inside f.",
      `The top term of g is like x^${n}; putting it into x^${m} gives (x^${n})^${m} = x^${m * n}`], `${ans}`);
  } else {
    const k = R.int(2, 3);
    ans = k * m + n;
    q = `deg f(x) = ${m} and deg g(x) = ${n}. Find the degree of (f(x))^${k} * g(x).`;
    sol = steps([`(f(x))^${k}: the top term becomes (x^${m})^${k} = x^${k * m}`,
      `Multiply by g(x): powers add,  x^${k * m} * x^${n} = x^${k * m + n}`], `${ans}`);
  }
  return P("Polynomial degree", q, F(ans), "num", sol, 20);
}

function g_poly_eq(t) {
  let q, sol, sols;
  if (t === 1) {
    const r1 = R.int(-7, 7), r2 = R.int(-7, 7);
    const coeffs = [1, -(r1 + r2), r1 * r2];
    sols = uniqFracs([F(r1), F(r2)]);
    q = `Find all solutions of ${poly(coeffs)} = 0.`;
    sol = steps([`Find two numbers that multiply to ${r1 * r2} and add to ${-(r1 + r2)}:   ${-r1} and ${-r2}`,
      `Factor:   (${poly([1, -r1])})(${poly([1, -r2])}) = 0`,
      "If two things multiply to 0, one of them is 0. Set each part equal to 0.",
      `${poly([1, -r1])} = 0  ->  x = ${r1};    ${poly([1, -r2])} = 0  ->  x = ${r2}`], sols.map(fmt).join(", "));
  } else if (t === 2) {
    const a = R.choice([2, 3]), r1 = R.int(-5, 5);
    const p = R.choice(range(-7, 8).filter((i) => i % a !== 0));
    const coeffs = [a, -(p + a * r1), p * r1];
    sols = uniqFracs([F(r1), F(p, a)]);
    q = `Find all solutions of ${poly(coeffs)} = 0.`;
    sol = steps([`Factor:   (${poly([1, -r1])})(${poly([a, -p])}) = 0    (multiply it out to check)`,
      "If two things multiply to 0, one of them is 0. Set each part equal to 0.",
      `${poly([1, -r1])} = 0  ->  x = ${r1}`, `${poly([a, -p])} = 0  ->  ${a}x = ${p}  ->  x = ${fmt(F(p, a))}`],
      sols.map(fmt).join(", "));
  } else {
    const a = R.int(1, 3), k = R.int(2, 5), k4 = Math.pow(k, 4);
    const coeffs = [1, -4 * a, 6 * a * a, -4 * a * a * a, Math.pow(a, 4) - k4];
    sols = uniqFracs([F(a + k), F(a - k)]);
    q = `Find all REAL solutions of ${poly(coeffs)} = 0.`;
    sol = steps([`The numbers 1, 4, 6, 4, 1 are the pattern for a 4th power:  (x - ${a})^4 = ${poly([1, -4 * a, 6 * a * a, -4 * a * a * a, Math.pow(a, 4)])}`,
      `So the equation is   (x - ${a})^4 - ${k4} = 0,  which means  (x - ${a})^4 = ${k4}`,
      `Take the 4th root: x - ${a} = ${k}  or  x - ${a} = -${k}   (since ${k}^4 = ${k4} and (-${k})^4 = ${k4})`,
      `So x = ${a + k}  or  x = ${a - k}.  (There are also two complex answers, ${a} + ${k}i and ${a} - ${k}i, but the question only asks for REAL ones.)`],
      sols.map(fmt).join(", "));
  }
  return P("Polynomial equation", q, sols, "list", sol, 45);
}

function palSum(d) {
  let s = 0;
  for (let x = Math.pow(10, d - 1); x < Math.pow(10, d); x++) { const t = String(x); if (t === t.split("").reverse().join("")) s += x; }
  return s;
}

function g_palindrome(t) {
  let q, sol, ans;
  if (t === 1) {
    const d = R.choice([3, 4, 5]), half = Math.floor((d + 1) / 2);
    ans = 9 * Math.pow(10, half - 1);
    q = `A palindrome reads the same forwards and backwards (like 27872).\nHow many ${d}-digit palindromes are there?`;
    sol = steps([`Once you pick the first ${half} digits, the rest are a mirror image - no more choices.`,
      "The first digit can be 1-9 (9 choices; it can't be 0).",
      `Each of the other ${half - 1} digit(s) you pick can be 0-9 (10 choices each).`,
      "Multiply:   9" + " * 10".repeat(half - 1) + ` = ${ans}`], `${ans}`);
  } else {
    const d = t === 2 ? 3 : R.choice([4, 5]);
    ans = palSum(d);
    const cnt = 9 * Math.pow(10, Math.floor((d + 1) / 2) - 1), pair = 2 * ans / cnt;
    q = `What is the sum of all of the ${d}-digit palindromes?`;
    sol = steps([`Count them first: there are ${cnt} palindromes with ${d} digits.`,
      "Pair each one with a 'partner': change the first and last digit a to (10 - a), and every middle digit b to (9 - b). The partner is also a palindrome.",
      `Each palindrome plus its partner always adds up to ${pair}.`,
      `There are ${cnt} / 2 = ${cnt / 2} pairs, so the sum is ${cnt / 2} * ${pair} = ${ans}`], `${ans}`);
  }
  return P("Palindromes", q, F(ans), "num", sol, 45);
}

const FLIP = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "=": "=" };

function ineqText(cons) {
  if (cons.length === 2) {
    const [lo, hi] = cons.slice().sort((a, b) => a[1].cmp(b[1]));
    if ((lo[0] === ">" || lo[0] === ">=") && (hi[0] === "<" || hi[0] === "<=")) return `${fmt(lo[1])} ${FLIP[lo[0]]} x ${hi[0]} ${fmt(hi[1])}`;
    return `x ${lo[0]} ${fmt(lo[1])} or x ${hi[0]} ${fmt(hi[1])}`;
  }
  return `x ${cons[0][0]} ${fmt(cons[0][1])}`;
}

function g_inequality(t) {
  const ops = ["<", "<=", ">", ">="];
  let cons, q, sol;
  if (t < 3) {
    const a = t === 1 ? R.int(1, 5) : (R.random() < 0.75 ? nz(-5, -1) : R.int(2, 5));
    const x0 = R.int(-8, 8), b = R.int(-9, 9), op = R.choice(ops), cc = a * x0 + b;
    const ansOp = a > 0 ? op : FLIP[op];
    cons = [[ansOp, F(x0)]];
    q = `Solve for x:  ${poly([a, b])} ${op} ${cc}`;
    const first = b ? `Get the x term alone: ${b > 0 ? `subtract ${b} from` : `add ${-b} to`} both sides:   ${poly([a, 0])} ${op} ${cc - b}`
      : `The x term is already alone:   ${poly([a, 0])} ${op} ${cc}`;
    let last;
    if (a < 0) last = `Divide both sides by ${a}. It's NEGATIVE, so the sign FLIPS (${op} becomes ${ansOp}):   x ${ansOp} ${x0}`;
    else if (a === 1) last = `That already says x ${ansOp} ${x0}.`;
    else last = `Divide both sides by ${a} (positive, so the sign stays the same):   x ${ansOp} ${x0}`;
    sol = steps([first, last], `x ${ansOp} ${x0}`);
  } else {
    const h = R.int(-6, 6), k = R.int(1, 7), op = R.choice(ops), inside = poly([1, -h]);
    cons = [[FLIP[op], F(h - k)], [op, F(h + k)]];
    if (op === "<" || op === "<=") {
      sol = steps([`|${inside}| ${op} ${k} means ${inside} is within ${k} of 0 - a 'between' answer:`,
        `-${k} ${op} ${inside} ${op} ${k}`, `Add ${h} to all three parts:   ${h - k} ${op} x ${op} ${h + k}`], `${h - k} ${op} x ${op} ${h + k}`);
    } else {
      sol = steps([`|${inside}| ${op} ${k} means ${inside} is far from 0 - more than ${k} away on either side - an 'or' answer:`,
        `${inside} ${FLIP[op]} -${k}   or   ${inside} ${op} ${k}`, `Add ${h} to both:   x ${FLIP[op]} ${h - k}   or   x ${op} ${h + k}`],
        `x ${FLIP[op]} ${h - k} or x ${op} ${h + k}`);
    }
    q = `Solve for x:  |${inside}| ${op} ${k}`;
  }
  return P("Inequalities", q, cons.sort((a, b) => a[1].cmp(b[1])), "ineq", sol, 30);
}

// In the same order as the Final Exam (inequalities sit next to absolute value).
const GENERATORS = [g_rational, g_shift, g_domain, g_piece_inverse, g_composition, g_exponent, g_log,
  g_interest, g_abs, g_inequality, g_arith_sum, g_geometric, g_degree, g_poly_eq, g_palindrome];
const TOPIC_NAMES = ["Rational equation", "Shifted input", "Domain", "Piecewise inverse", "Composition", "Exponent rules",
  "Logarithms", "Compound interest", "Absolute value", "Inequalities", "Arithmetic series", "Geometric sequence",
  "Polynomial degree", "Polynomial equation", "Palindromes"];


function examProblems() {
  if (EXAM_DATA) return EXAM_DATA.map(decProb);
  if (typeof examProblemsPlain === "function") return examProblemsPlain();
  throw new Error("The real exam is locked - sign in as the teacher.");
}
let EXAM_DATA = null;
function setExamData(d) { EXAM_DATA = d; }
function examUnlocked() { return !!EXAM_DATA || typeof examProblemsPlain === "function"; }

function buildQueue(tier, gens, n, exam) {
  if (exam) return examProblems();
  gens = GENERATORS.filter((g) => gens.includes(g));
  if (!gens.length) gens = GENERATORS.slice();
  if (n < gens.length) {
    const pick = R.sample(gens, n);
    gens = GENERATORS.filter((g) => pick.includes(g));
  }
  const per = Math.floor(n / gens.length), extra = n % gens.length;
  const out = [];
  gens.forEach((g, k) => { for (let i = 0; i < per + (k < extra ? 1 : 0); i++) out.push(g(tier)); });
  return out;
}

// ---------------------------------------------------------------- reading answers
function parseNum(s) {
  if (/\d\s+[\d.]/.test(s)) return null;           // '-5 5' is two numbers, not -55
  s = String(s).trim().replace(/\$/g, "").replace(/ /g, "").replace(/−/g, "-");
  s = s.replace(/^\s*[a-z]\s*=\s*/i, "");
  return parseFrac(s);
}

function normInterval(s) {
  return String(s).toLowerCase().replace(/ /g, "").replace(/−/g, "-")
    .replace(/∞/g, "inf").replace(/infinity/g, "inf").replace(/\+inf/g, "inf")
    .replace(/∪/g, "u").replace(/or/g, "u");
}

const INF = Infinity;
function isNumLike(v) { return v instanceof Frac; }
function valEq(a, b) { return isNumLike(a) && isNumLike(b) ? a.eq(b) : a === b; }
function valNum(a) { return isNumLike(a) ? a.valueOf() : a; }

function parseInterval(raw) {
  const s = normInterval(raw);
  const out = [];
  for (const part of s.split("u")) {
    const m = /^([\[(])([^,\[\]()]+),([^,\[\]()]+)([\])])$/.exec(part);
    if (!m) return null;
    const ends = [];
    for (const v of [m[2], m[3]]) {
      if (v === "-inf" || v === "inf") ends.push(v[0] === "-" ? -INF : INF);
      else { const f = parseNum(v); if (f === null) return null; ends.push(f); }
    }
    out.push([m[1] === "[", ends[0], ends[1], m[4] === "]"]);
  }
  return out.sort((a, b) => valNum(a[1]) - valNum(b[1]) || valNum(a[2]) - valNum(b[2]));
}

function parseIneq(raw) {
  const s = String(raw).toLowerCase().replace(/ /g, "").replace(/≤/g, "<=").replace(/≥/g, ">=")
    .replace(/=</g, "<=").replace(/=>/g, ">=").replace(/−/g, "-");
  const cons = [];
  const chunks = s.split(/or|\|\||u/);
  for (const chunk of chunks) {
    const parts = chunk.split(/(<=|>=|<|>|=)/);
    if (parts.length === 3) {
      const [left, op, right] = parts;
      if (left === "x") { const v = parseNum(right); if (v === null) return null; cons.push([op, v]); }
      else if (right === "x") { const v = parseNum(left); if (v === null) return null; cons.push([FLIP[op], v]); }
      else return null;
    } else if (parts.length === 5 && parts[2] === "x") {
      const va = parseNum(parts[0]), vb = parseNum(parts[4]);
      if (va === null || vb === null) return null;
      cons.push([FLIP[parts[1]], va]);
      cons.push([parts[3], vb]);
    } else return null;
  }
  if (!cons.length) return null;
  return [cons.sort((a, b) => a[1].cmp(b[1])), chunks.length > 1];
}

function isOr(cons) {
  if (cons.length !== 2) return false;
  const [lo, hi] = cons;
  return !((lo[0] === ">" || lo[0] === ">=") && (hi[0] === "<" || hi[0] === "<="));
}

function ineqToIntervals(cons, joinedByOr) {
  const one = (op, a) => ({ "<": [false, -INF, a, false], "<=": [false, -INF, a, true], ">": [false, a, INF, false],
    ">=": [true, a, INF, false], "=": [true, a, a, true] }[op]);
  if (cons.length === 2 && !joinedByOr) {
    const [[o1, a], [o2, b]] = cons.slice().sort((x, y) => x[1].cmp(y[1]));
    if ((o1 === ">" || o1 === ">=") && (o2 === "<" || o2 === "<=")) return [[o1 === ">=", a, b, o2 === "<="]];
  }
  return cons.map(([o, v]) => one(o, v)).sort((a, b) => valNum(a[1]) - valNum(b[1]) || valNum(a[2]) - valNum(b[2]));
}

function intervalsOf(raw) {
  const iv = parseInterval(raw);
  if (iv !== null) return iv;
  const r = parseIneq(raw);
  return r ? ineqToIntervals(r[0], r[1]) : null;
}

function ivEq(A, B) {
  return A.length === B.length && A.every((x, i) => x[0] === B[i][0] && valEq(x[1], B[i][1]) && valEq(x[2], B[i][2]) && x[3] === B[i][3]);
}
function absVal(v) { return isNumLike(v) ? v.abs() : Math.abs(v); }
function sortKey(v) { return isNumLike(v) ? v.valueOf() : v; }

function gradeIntervals(got, want) {
  if (!got || !want) return 0;
  if (ivEq(got, want)) return 1;
  if (got.length === want.length) {
    if (got.every((x, i) => valEq(x[1], want[i][1]) && valEq(x[2], want[i][2]))) return 0.5;
    const absl = (L) => L.map(([lc, a, b, rc]) => [lc, absVal(a), absVal(b), rc])
      .sort((x, y) => (x[0] - y[0]) || (sortKey(x[1]) - sortKey(y[1])) || (sortKey(x[2]) - sortKey(y[2])) || (x[3] - y[3]));
    if (ivEq(absl(got), absl(want))) return 0.5;
  }
  return 0;
}

function consEq(a, b) { return a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1].eq(b[i][1])); }

const NONE_WORDS = ["none", "no solution", "no solutions", "nosolution", "{}", "empty"];
const LIST_SPLIT = /\s*(?:,|;|\bor\b|\band\b)\s*/;

function parsePoly(raw) {
  let s = String(raw).toLowerCase().replace(/ /g, "").replace(/−/g, "-").replace(/\*\*/g, "^").replace(/\*/g, "");
  s = s.split("=").pop();
  if (!s) return null;
  s = s.replace(/-/g, "+-");
  const out = {};
  for (const term of s.split("+")) {
    if (!term) continue;
    const m = /^(-?)(\d+(?:\.\d+)?(?:\/\d+)?)?(x(?:\^(\d+))?)?$/.exec(term);
    if (!m || (m[2] === undefined && m[3] === undefined)) return null;
    let co = m[2] !== undefined ? parseFrac(m[2]) : F(1);
    if (co === null) return null;
    if (m[1]) co = co.neg();
    const deg = !m[3] ? 0 : (m[4] ? parseInt(m[4], 10) : 1);
    out[deg] = (out[deg] || F(0)).add(co);
  }
  for (const d of Object.keys(out)) if (out[d].isZero()) delete out[d];
  return out;
}

const DEC = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
function parseComplex(t) {
  if (t.endsWith("i")) {
    const body = t.slice(0, -1);
    let k = -1;
    for (let i = body.length - 1; i > 0; i--) if (body[i] === "+" || body[i] === "-") { k = i; break; }
    const re = k > 0 ? body.slice(0, k) : "0";
    const im = k > 0 ? body.slice(k) : body;
    if (!DEC.test(re) || !DEC.test(im)) return null;
    return [parseFloat(re), parseFloat(im)];
  }
  if (!DEC.test(t)) return null;
  return [parseFloat(t), 0];
}

function parseComplexList(raw) {
  const s = String(raw).toLowerCase().replace(/ /g, "").replace(/−/g, "-").replace(/±/g, "+/-");
  const vals = [];
  for (const tok of s.split(/,|;|\bor\b|\band\b/)) {
    if (!tok) continue;
    const toks = tok.includes("+/-") ? [tok.replace("+/-", "+"), tok.replace("+/-", "-")] : [tok];
    for (let t of toks) {
      t = t.replace(/^x=/, "").replace(/(^|[^\d.])i/g, (m, p) => p + "1i").replace(/j/g, "i");
      const z = parseComplex(t);
      if (!z) return null;
      vals.push(z);
    }
  }
  return vals.length ? vals : null;
}
function r6(x) { return Math.round(x * 1e6) / 1e6 + 0; }
function clKey(L) {
  const set = new Set(L.map(([a, b]) => `${r6(a)},${r6(b)}`));
  return Array.from(set).sort().join(";");
}

// words, not numbers: capitals, punctuation, extra spaces and a leading "the/a/an" don't matter
function normText(s) {
  return String(s).toLowerCase().normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[.,!?;:"\u201c\u201d()]/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^(the|a|an) /, "");
}
const MATH_KINDS = ["num", "list", "interval", "ineq", "money", "point", "poly", "clist"];

// returns 1, 0.5 (sign slip), 0 - or null when only the teacher can grade it (long answers)
function grade(prob, raw) {
  const kind = prob.kind, ans = prob.ans;
  raw = String(raw);
  if (kind === "choice") return /^\d+$/.test(raw.trim()) && parseInt(raw, 10) === ans ? 1 : 0;
  if (kind === "text") { const n = normText(raw); return n && ans.some((a) => normText(a) === n) ? 1 : 0; }
  if (kind === "long") return null;
  if (kind === "num") {
    const x = parseNum(raw);
    if (x === null) return 0;
    if (x.eq(ans)) return 1;
    if (!ans.isZero() && x.eq(ans.neg())) return 0.5;
    if (raw.includes(".") && ans.d !== 1) {
      if (x.sub(ans).abs().lt(F(1, 200))) return 1;
      if (x.add(ans).abs().lt(F(1, 200))) return 0.5;
    }
    return 0;
  }
  if (kind === "money") {
    const x = parseNum(raw.replace(/,/g, ""));
    if (x === null) return 0;
    if (Math.abs(x.valueOf() - ans) <= 0.011) return 1;
    if (Math.abs(x.valueOf() + ans) <= 0.011) return 0.5;
    return 0;
  }
  if (kind === "interval") return gradeIntervals(intervalsOf(raw), parseInterval(ans));
  if (kind === "ineq") {
    const parsed = parseIneq(raw);
    if (!parsed) return gradeIntervals(parseInterval(raw), ineqToIntervals(ans, isOr(ans)));
    const [got, typedOr] = parsed;
    if (consEq(got, ans) && typedOr === isOr(ans)) return 1;
    if (consEq(got, ans)) return 0.5;
    if (got.length === ans.length) {
      if (got.every((c, i) => c[1].eq(ans[i][1]))) return 0.5;
      const k = (L) => L.map(([o, v]) => `${o}|${fmt(v.abs())}`).sort().join(";");
      if (k(got) === k(ans)) return 0.5;
    }
    return 0;
  }
  if (kind === "list") {
    const low = raw.trim().toLowerCase();
    if (NONE_WORDS.includes(low)) return ans.length ? 0 : 1;
    const parts = raw.trim().split(LIST_SPLIT).filter(Boolean);
    const vals = parts.map(parseNum);
    if (!vals.length || vals.some((v) => v === null)) return 0;
    const got = uniqFracs(vals);
    if (got.length === ans.length && got.every((v, i) => v.eq(ans[i]))) return 1;
    const a1 = sortFracs(got.map((v) => v.abs())), a2 = sortFracs(ans.map((v) => v.abs()));
    if (a1.length === a2.length && a1.every((v, i) => v.eq(a2[i]))) return 0.5;
    return 0;
  }
  if (kind === "poly") {
    const got = parsePoly(raw);
    if (!got) return 0;
    const kg = Object.keys(got).sort(), ka = Object.keys(ans).sort();
    if (kg.join() !== ka.join()) return 0;
    if (ka.every((d) => got[d].eq(ans[d]))) return 1;
    if (ka.every((d) => got[d].abs().eq(ans[d].abs()))) return 0.5;
    return 0;
  }
  if (kind === "point") {
    const nums = raw.replace(/−/g, "-").match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || [];
    if (nums.length !== 2) return 0;
    const got = nums.map(parseFrac);
    if (got.some((v) => v === null)) return 0;
    if (got[0].eq(ans[0]) && got[1].eq(ans[1])) return 1;
    if (got[0].abs().eq(ans[0].abs()) && got[1].abs().eq(ans[1].abs())) return 0.5;
    return 0;
  }
  if (kind === "yesno") {
    const w = raw.trim().toLowerCase();
    const said = w.startsWith("y") ? "yes" : w.startsWith("n") ? "no" : null;
    return said === ans ? 1 : 0;
  }
  if (kind === "clist") {
    const got = parseComplexList(raw);
    if (!got) return 0;
    if (clKey(got) === clKey(ans)) return 1;
    const absl = (L) => L.map(([a, b]) => `${Math.abs(r6(a))},${Math.abs(r6(b))}`).sort().join(";");
    if (got.length === ans.length && absl(got) === absl(ans)) return 0.5;
    return 0;
  }
  return 0;
}

function readable(prob, raw) {
  const kind = prob.kind, t = String(raw).trim();
  if (!t) return false;
  if (kind === "choice") return /^\d+$/.test(t) && parseInt(t, 10) < (prob.options || []).length;
  if (kind === "text" || kind === "long") return true;
  if (kind === "num") return parseNum(t) !== null;
  if (kind === "money") return parseNum(t.replace(/,/g, "")) !== null;
  if (kind === "list") {
    if (NONE_WORDS.includes(t.toLowerCase())) return true;
    const parts = t.split(LIST_SPLIT).filter(Boolean);
    return parts.length > 0 && parts.every((x) => parseNum(x) !== null);
  }
  if (kind === "interval" || kind === "ineq") return intervalsOf(t) !== null;
  if (kind === "point") return (t.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []).length === 2;
  if (kind === "poly") { const p = parsePoly(t); return !!p && Object.keys(p).length > 0; }
  if (kind === "clist") return parseComplexList(t) !== null;
  if (kind === "yesno") return ["y", "n"].includes(t.toLowerCase()[0]);
  return true;
}

const HOW_TO_TYPE = {
  num: "Type one number, like 12, -3, 13/4 or 0.75",
  list: "Type every answer, separated by commas, like 0.5, -12   (or type none)",
  interval: "Use interval notation, like [0, 10] or (-inf, 0.5]   (inf = infinity, U joins two pieces)",
  ineq: "Type an inequality, like x > 0.5  or  -1.5 < x <= 4.5  or  x < 0 or x > 9",
  money: "Type dollars and cents, like 1234.56",
  point: "Type a point, like (0.5, -1.5)",
  poly: "Type a polynomial, highest power first, like 5x^3 - x + 8",
  clist: "Type every solution, separated by commas, like 7, -2, 3+4i, 3-4i",
  yesno: "Pick yes or no",
  choice: "Pick one answer",
  text: "Type a short answer (capital letters and punctuation don't matter)",
  long: "Write your answer. Your teacher will read and grade it.",
};

function approxFrac(x) {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x) + 0);
  for (let d = 2; d <= 1000; d++) { const n = Math.round(x * d); if (Math.abs(x - n / d) < 1e-9) return fmt(F(n, d)); }
  return String(x);
}
function complexText([re, im]) {
  const r = approxFrac(re);
  if (Math.abs(im) < 1e-9) return r;
  let i = approxFrac(Math.abs(im));
  i = i === "1" ? "" : i;
  if (Math.abs(re) < 1e-9) return `${im < 0 ? "-" : ""}${i}i`;
  return `${r} ${im < 0 ? "-" : "+"} ${i}i`;
}

function answerText(prob) {
  const a = prob.ans, k = prob.kind;
  if (k === "choice") return (prob.options || [])[a] || "";
  if (k === "text") return a.length > 1 ? `${a[0]}   (also accepted: ${a.slice(1).join(", ")})` : (a[0] || "");
  if (k === "long") return "";
  if (k === "num") return fmt(a);
  if (k === "money") return money(a);
  if (k === "interval") return a.replace(/,/g, ", ").replace(/u/g, " U ").replace(/inf/g, "∞");
  if (k === "list") return a.length ? a.map(fmt).join(", ") : "none";
  if (k === "ineq") return ineqText(a);
  if (k === "poly") {
    const top = Math.max(...Object.keys(a).map(Number));
    const co = [];
    for (let d = top; d >= 0; d--) co.push(a[d] || F(0));
    return poly(co);
  }
  if (k === "point") return `(${fmt(a[0])}, ${fmt(a[1])})`;
  if (k === "yesno") return a;
  if (k === "clist") return a.map(complexText).join(", ");
  return String(a);
}

function shownAnswer(prob, raw) {
  if (prob.kind === "choice" && /^\d+$/.test(String(raw))) return (prob.options || [])[parseInt(raw, 10)] || String(raw);
  return String(raw);
}

// ---- teacher's own questions: turn the typed answer into something gradable
const ANSWER_TYPES = [["Auto-detect", ""], ["Number", "num"], ["Several numbers", "list"], ["Interval", "interval"],
  ["Inequality", "ineq"], ["Money", "money"], ["Point (x, y)", "point"], ["Polynomial", "poly"],
  ["Complex numbers", "clist"], ["Yes / No", "yesno"]];
const KIND_NAME = Object.fromEntries(ANSWER_TYPES.filter((x) => x[1]).map(([n, k]) => [k, n]));

function guessKind(t) {
  const l = t.toLowerCase().replace(/ /g, "");
  if (["yes", "no", "y", "n"].includes(l)) return "yesno";
  if (["none", "nosolution", "nosolutions"].includes(l)) return "list";
  if (/[<>≤≥]/.test(l)) return "ineq";
  if (l.startsWith("$")) return "money";
  if ("[(".includes(l[0]) && "])".includes(l[l.length - 1])) {
    if (l.includes("inf") || l.includes("∞") || l.includes("u") || l.includes("∪") || l[0] !== "(" || l[l.length - 1] !== ")") return "interval";
    return "point";
  }
  if (/(\d|^|[+-])i$|(\d|^|[+-])i[,;]/.test(l)) return "clist";
  if (l.includes("x")) return "poly";
  if (l.includes(",") || t.toLowerCase().includes(" or ")) return "list";
  return "num";
}

function parseAnswer(text, kind) {
  const t = String(text).trim();
  if (!t) throw new Error("Type the correct answer.");
  kind = kind || guessKind(t);
  const bad = new Error(`That doesn't look like a ${KIND_NAME[kind].toLowerCase()}.`);
  if (kind === "num") { const v = parseNum(t); if (v === null) throw bad; return [kind, v]; }
  if (kind === "list") {
    if (["none", "no solution", "no solutions"].includes(t.toLowerCase())) return [kind, []];
    const vals = t.split(LIST_SPLIT).filter(Boolean).map(parseNum);
    if (!vals.length || vals.some((v) => v === null)) throw bad;
    return [kind, uniqFracs(vals)];
  }
  if (kind === "interval") { if (!parseInterval(t)) throw bad; return [kind, normInterval(t)]; }
  if (kind === "ineq") { const r = parseIneq(t); if (!r) throw bad; return [kind, r[0]]; }
  if (kind === "money") { const v = parseNum(t.replace(/,/g, "")); if (v === null) throw bad; return [kind, Math.round(v.valueOf() * 100) / 100]; }
  if (kind === "point") {
    const nums = t.replace(/−/g, "-").match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || [];
    if (nums.length !== 2) throw bad;
    return [kind, nums.map(parseFrac)];
  }
  if (kind === "poly") { const v = parsePoly(t); if (!v || !Object.keys(v).length) throw bad; return [kind, v]; }
  if (kind === "clist") { const v = parseComplexList(t); if (!v) throw bad; return [kind, v]; }
  if (kind === "yesno") {
    const w = t.toLowerCase();
    if (w.startsWith("y")) return [kind, "yes"];
    if (w.startsWith("n")) return [kind, "no"];
    throw bad;
  }
  throw bad;
}

// ---- problems <-> JSON (for sending to students and saving)
function encAns(kind, a) {
  if (kind === "num") return fmt(a);
  if (kind === "list") return a.map(fmt);
  if (kind === "ineq") return a.map(([o, v]) => [o, fmt(v)]);
  if (kind === "poly") return Object.fromEntries(Object.entries(a).map(([d, v]) => [d, fmt(v)]));
  if (kind === "point") return [fmt(a[0]), fmt(a[1])];
  return a;
}
function decAns(kind, a) {
  if (kind === "num") return parseFrac(a);
  if (kind === "list") return a.map(parseFrac);
  if (kind === "ineq") return a.map(([o, v]) => [o, parseFrac(v)]);
  if (kind === "poly") return Object.fromEntries(Object.entries(a).map(([d, v]) => [Number(d), parseFrac(v)]));
  if (kind === "point") return [parseFrac(a[0]), parseFrac(a[1])];
  return a;
}
function encProb(p) {
  const d = { topic: p.topic, q: p.q, kind: p.kind, sol: p.sol, base: p.base, ans: encAns(p.kind, p.ans) };
  if (p.graph) d.graph = p.graph;
  if (p.options) d.options = p.options;
  if (p.teacherSol) d.teacherSol = true;
  if (p.tools) d.tools = p.tools;
  return d;
}
function decProb(d) {
  const p = P(d.topic, d.q, decAns(d.kind, d.ans), d.kind, d.sol, d.base || 40);
  if (d.graph) p.graph = d.graph;
  if (d.options) p.options = d.options;
  if (d.teacherSol) p.teacherSol = true;
  if (d.tools && typeof d.tools === "object") p.tools = { spell: !!d.tools.spell, grammar: !!d.tools.grammar, dict: !!d.tools.dict };
  return p;
}

// ---------------------------------------------------------------- rival
const RIVALS = {
  1: { name: "Rookie Ricky", speed: 1.6, acc: 0.62 },
  2: { name: "Steady Stella", speed: 1.05, acc: 0.80 },
  3: { name: "Lightning Max", speed: 0.7, acc: 0.93 },
};
function rivalAttempt(tier, prob) {
  const rv = RIVALS[tier];
  const t = prob.base * rv.speed * R.uniform(0.6, 1.45);
  const roll = R.random();
  let pts;
  if (roll < rv.acc) pts = 1;
  else if (roll < rv.acc + (1 - rv.acc) * 0.4 && ["num", "list", "money", "ineq", "interval", "poly", "point", "clist"].includes(prob.kind)) pts = 0.5;
  else pts = 0;
  return [Math.round(t * 10) / 10, pts];
}
function fmtPts(p) { return Number.isInteger(p) ? String(p) : String(+p.toFixed(2)); }

function selfTest(n = 200) {
  let bad = 0;
  for (const g of GENERATORS) for (const tier of [1, 2, 3]) for (let i = 0; i < n; i++) {
    const p = g(tier);
    const txt = answerText(p).replace(/∞/g, "inf");
    if (grade(p, txt) !== 1 || !readable(p, txt)) { bad++; if (bad < 10) console.log("FAIL", g.name, tier, p.q, txt); }
    const p2 = decProb(JSON.parse(JSON.stringify(encProb(p))));
    if (grade(p2, txt) !== 1) { bad++; if (bad < 10) console.log("FAIL roundtrip", g.name, p.q); }
  }
  for (const p of examProblems()) {
    const txt = answerText(p).replace(/∞/g, "inf");
    if (grade(p, txt) !== 1) { bad++; console.log("FAIL exam", p.q, txt); }
  }
  return bad;
}

const MathDuel = { Frac, F, fmt, parseFrac, GENERATORS, TOPIC_NAMES, examProblems, buildQueue, grade, readable, answerText,
  HOW_TO_TYPE, parseAnswer, setExamData, examUnlocked, normText, MATH_KINDS, shownAnswer, ANSWER_TYPES, KIND_NAME, encProb, decProb, RIVALS, rivalAttempt, fmtPts, selfTest, money };
if (typeof module !== "undefined") module.exports = MathDuel;
