# Solver core for a browser-based student circuit simulator: numerical methods and software options

Scope note: research done 2026-10-26 with web search/fetch. Several primary sources (TUM compendium PDF, full ngspice HTML manual) could not be read: the first is bot-blocked, the second is 4.8M characters long and the options chapter was out of reach. Statements marked "(standard textbook knowledge, not verified this session)" in Inferences are well-established material from Ho/Ruehli/Brennan, Vladimirescu, Najm and Pillage/Rohrer, but I did not re-read them here. The report writer should treat those as background, not cited fact.

## 1. Modified Nodal Analysis: stamps, dependent sources, op-amps, switches, singular matrices

### Takeaway
MNA, as defined by Ho, Ruehli & Brennan (1975), is the right core formulation. It adds one current unknown and one constraint row for every element whose current can't be written from node voltages (V sources, VCVS, CCVS, inductors in DC, ideal op-amp outputs, 0 V ammeters). Student-friendly error messages can be modeled on CircuitJS, which detects topology faults before factoring (voltage-source/wire loops, capacitor loops, floating nodes) instead of only reporting "singular matrix".

### Cited Findings
- Primary reference: C.-W. Ho, A. E. Ruehli, P. A. Brennan, "The Modified Nodal Approach to Network Analysis," IEEE Trans. Circuits and Systems, vol. CAS-22, no. 6, pp. 504–509, June 1975, DOI 10.1109/TCS.1975.1084079. It fixes classical nodal analysis's "inability to process voltage sources and current-dependent circuit elements in a simple and efficient manner." It also gives a simple pivoting scheme and shows MNA beats the tableau method on dimension, nonzeros and fill-ins. — [IBM Research publication page](https://research.ibm.com/publications/the-modified-nodal-approach-to-network-analysis); scanned copy at [spinningnumbers.org MNA75.pdf](https://spinningnumbers.org/assets/MNA75.pdf)
- Block structure (Swarthmore notes). For n non-ground nodes and m voltage sources, A = [G B; C D], x = [v; j], z = [i; e]:
  - G holds the conductance sums: diagonal = sum of conductances at node k, off-diagonal = −1/R.
  - B(n×m) has +1 where a source's + terminal sits and −1 where its − terminal sits.
  - C = Bᵀ when there are no dependent sources, and D = 0 for independent sources.
  - i holds the current-source injections into each node, e holds the source voltages, and ground is excluded.
  - Worked example: G = [1/R1+1/R2, −1/R2; −1/R2, 1/R2+1/R3], B = [1; −1].
  — [Swarthmore, "Modified Nodal Analysis" (MNA3)](https://lpsa.swarthmore.edu/Systems/Electrical/mna/MNA3.html)
- MNA principle as Bürmen (Univ. Ljubljana) states it: "If we cannot explicitly express a branch current with branch voltages we simply keep that branch current as an unknown," and add one equation per kept current. Unknowns are ordered nodal voltages first, then MNA currents. A grounded pin drops its row/column. — [Bürmen, U. Ljubljana CAO lecture "Modified nodal analysis"](https://zrojec.fe.uni-lj.si/cao/modified-nodal-analysis/)
- Per-element structure from the same lecture (the exact matrix entries are images that didn't extract):
  - Independent V source (+ at k, − at l): adds unknown i (into the + pin) and one constitutive row. RHS gets the source value.
  - VCVS: adds unknown i, contributes to KCL at k and l, adds a constitutive row, and leaves the RHS untouched.
  - CCCS: adds A·i_c to KCL at k and l, with no new unknown or row. The controlling current must already be an unknown, so insert a 0 V source to create one.
  - CCVS: adds an unknown and a row.
  - Ideal op-amp with negative feedback: input currents are zero, the output is modeled as a VCVS from output to ground with its current as an unknown, and the constraint is v₊ − v₋ = 0.
  - Ideal transformer: VCVS on the secondary plus CCCS on the primary.
  — [Bürmen, U. Ljubljana](https://zrojec.fe.uni-lj.si/cao/modified-nodal-analysis/)
- Plain nodal analysis can't handle floating voltage sources, VCVS, CCCS or CCVS. MNA fixes this with an added current column and constraint row. — [UCSD CSE245 Lec1 slides (2004)](https://cseweb.ucsd.edu/classes/fa04/cse245/notes/Lec1-Intr.pdf)
- Stamp tables for VCVS, CCCS and CCVS, plus a compact ideal op-amp treatment (output current as an unknown and equal input voltages, so the nodal model reduces to two VCCSs / a nullor), are in a 1995 UFRJ paper. — [Moreirão de Queiroz et al., UFRJ compact1995.pdf](https://www.coe.ufrj.br/~acmq/papers/compact1995.pdf)
- Nullor-based models for op-amps, OTAs and CFAs in MNA are treated in Biolek & Biolková's symbolic-analysis chapter. — [Bentham/EurekaSelect chapter](https://www.eurekaselect.com/chapter/4235)
- Falstad CircuitJS engine (CirSim.java, GPL v2-or-later):
  - Matrix size is `nodeList.size()-1 + voltageSourceCount`, with one extra row/column per voltage source.
  - Wires are not stamped. Their nodes are merged (`calculateWireClosure()`) and the currents are recovered afterward.
  - `connectUnconnectedNodes()` ties floating nodes to ground through a 1e8 Ω resistor.
  - User-facing errors include "Voltage source/wire loop with no resistance!", "Path to ground with no resistance!", "Capacitor loop with no resistance!", "wire loop detected", "Singular matrix!", "Matrix error", "Convergence failed!" and "nan/infinite matrix!".
  - Bad connections are marked with red dots on the canvas.
  — [CircuitJS1 CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java)
- CircuitJS also runs `simplifyMatrix()`. It eliminates rows with only one non-constant nonzero, folds their values into the RHS, and reports "Matrix error" for an all-zero row. — [CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java)
- In ngspice logs, singular-matrix warnings typically point to a floating or ill-defined node. — [Qorvo QSPICE forum thread (secondary)](https://forum.qorvo.com/t/apparent-kirchhoff-s-law-violation/15048/2)

### Inferences
- (Standard textbook knowledge, not verified this session.) Stamps with unknown ordering [v; i_extra]:
  - R between a,b: G[a,a]+=g, G[b,b]+=g, G[a,b]−=g, G[b,a]−=g.
  - Independent I source of value I from a to b (current leaves a, enters b through the external circuit): z[a]−=I, z[b]+=I.
  - V source k (+a, −b): M[a,k]+=1, M[b,k]−=1, M[k,a]+=1, M[k,b]−=1, z[k]=V.
  - VCCS gm (output a→b, control c,d): M[a,c]+=gm, M[a,d]−=gm, M[b,c]−=gm, M[b,d]+=gm.
  - VCVS μ: like a V source, but the row k is v_a − v_b − μ(v_c − v_d) = 0.
  - CCVS r: V-source row v_a − v_b − r·i_ctrl = 0, where i_ctrl is the controlling 0 V source's current unknown.
  - CCCS β: M[a, k_ctrl]+=β, M[b, k_ctrl]−=β.
  - Ideal op-amp (nullor): extra unknown = output current, whose column touches only the output node row. Its row is v₊ − v₋ = 0. This is valid only with negative feedback, and the matrix is singular or ill-posed otherwise.
  - Finite-gain op-amp: VCVS with gain A (e.g. 1e5) plus optional Rin/Rout. Single-pole versions add a C for AC/transient.
- Switch: either toggle a resistor between R_on (e.g. 1e-3 Ω) and R_off (e.g. 1e9 Ω), or, for an ideal closed switch, a 0 V source / node merge (CircuitJS-style wire closure). Node merging avoids ill-conditioning from huge conductance ratios and is preferable for homework-grade answers.
- Pre-factorization topology checks give much better student errors than a bare LU failure. They are cheap graph algorithms:
  - Union-find over "zero-impedance" edges (V sources, wires, closed switches, inductors at DC) finds voltage-source loops.
  - Removing all non-current-source edges and checking connectivity finds current-source-only cutsets (nodes reachable only through I sources or capacitors at DC).
  - BFS from ground over all elements finds floating subcircuits.
  - Each finding should highlight the offending elements. CircuitJS's message list is a good template.
- Don't silently add gmin (CircuitJS's 1e8 Ω trick) in a homework-checker. Report the floating node instead, because a silent fix can produce a plausible but wrong-looking answer.

### Gaps
- I didn't extract the exact stamp matrices from Ho/Ruehli/Brennan, Vladimirescu or Najm. Those pages are images or paywalled. The inferred stamps above should be checked against the 1975 paper's Table I (scanned copy linked above).
- I found no primary source formally stating the structural singularity conditions (V-source loops, I-source cutsets) in MNA terms. These are well known (e.g. Najm ch. 2) but uncited here.

## 2. Transient analysis: companion models, integration methods, ringing, timestep control, initial conditions

### Takeaway
Use Norton companion models (conductance plus history current source). Start with backward Euler for robustness, offer trapezoidal as the accurate default, and add BDF2/Gear to damp trapezoidal ringing. Production SPICE uses LTE-based variable stepping with breakpoints, and it resets to order 1 at each breakpoint and at t=0.

### Cited Findings
- Capacitor trapezoidal companion: R = h/(2C), I = −(2C·u_k/h + q̇_k). q̇ must be stored from the last accepted point, and the first timepoint uses backward Euler since it needs no past derivative. A nonlinear capacitor uses c(u)=dq/du with an extra Newton term. — [Bürmen/U. Ljubljana CAO lecture 9, "Approximating the continuous time scale with discrete steps"](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- BDF(n) is defined with coefficients a₀…a_{n−1}, b₋₁. BDF1 equals backward Euler, and SPICE OPUS allows Gear order up to 6. — [U. Ljubljana lecture 9](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- Explicit methods go unstable when the step exceeds the circuit time constant, so stiff circuits need implicit methods. — [U. Ljubljana lecture 9](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- LTE is the error at t_{k+1} assuming exact past values. Its leading term uses the error coefficient C_{n+1} and the (n+1)th derivative, estimated by divided differences over the last n+2 points or by predictor-corrector difference. — [U. Ljubljana lecture 9](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- Step control loop:
  - Reject the step if Newton fails or converges slowly, then shrink h and set the order to 1.
  - On acceptance, raise the order (up to maxord), choose h* to bound the LTE, cap it at h* ≤ 2h_k, and stop if h* is too small.
  - Breakpoints (discontinuities in a source value or derivative) cut the step so t_{k+1} = t_b, and the order resets to 1 after each one.
  — [U. Ljubljana lecture 9](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- Trapezoidal and variable-order BDF (Gear) are the popular integration methods in circuit simulators. — [ASILOM-88 paper, Memorial Univ. repository](https://research.library.mun.ca/14689/1/ASILOM-88.pdf)
- Trapezoidal ringing can be reduced by `.options method=Gear`, a lower TRTOL, or a smaller max timestep. The QSPICE author warns that Gear "adds a substantial artificial damping" that has hidden real instabilities. — [Qorvo QSPICE forum (simulator author, secondary for ngspice)](https://forum.qorvo.com/t/need-guidance-on-qspice-integration-method-and-this-feather-parameter/14393)
- Ringing often appears in inductor+diode circuits when the inductor current reaches zero. — [Qorvo forum](https://forum.qorvo.com/t/voltage-oscillation-in-different-transformer-modeling-approach/18253)
- TRTOL default is reportedly 7 and should not exceed 1/RELTOL. — [youspice.com (secondary)](https://youspice.com/?p=18779). I couldn't confirm this in the ngspice manual.
- CircuitJS capacitor model:
  - Trapezoidal companion `compResistance = timeStep/(2*C)` with history `curSourceValue = -voltdiff/compResistance - current`.
  - Backward Euler `compResistance = timeStep/C`, `curSourceValue = -voltdiff/compResistance`. Trapezoidal is the default unless FLAG_BACK_EULER is set.
  - In DC analysis the capacitor becomes a 1e8 Ω resistor, and the default initial voltage is 1e-3 V so oscillators start.
  — [CircuitJS1 CapacitorElm.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CapacitorElm.java)
- CircuitJS timestepping:
  - Starts at maxTimeStep and halves the step on convergence failure (when adjustable stepping is on).
  - Doubles it back after 3 good iterations, `timeStep = Math.min(timeStep*2, maxTimeStep)`.
  - Errors with "Convergence failed!" below minTimeStep.
  - There is no LTE control; the step only adapts to Newton failure.
  — [CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java)

### Inferences
- (Standard textbook knowledge, not verified this session.) Companion models:
  - Capacitor: BE G = C/h, I_eq = (C/h)·v_n. Trap G = 2C/h, I_eq = (2C/h)·v_n + i_n. BDF2 (constant h) G = 3C/(2h), I_eq = (C/h)(2v_n − ½v_{n−1}).
  - Inductor (duals): BE G = h/L, I_eq = i_n. Trap G = h/(2L), I_eq = i_n + (h/2L)·v_n.
  - Trapezoidal is A-stable but not L-stable: for very stiff modes its amplification factor approaches −1, which causes the step-to-step oscillation ("ringing") after discontinuities. BE and BDF2 are L-stable and damp that mode.
- Recommended plan for a student tool:
  - (a) Fixed-step BE/trap first, with breakpoints at source edges and a BE step at t=0 and after each breakpoint (that's how SPICE avoids trap ringing at steps).
  - (b) Then LTE-controlled variable step using the charge/flux divided-difference estimate.
  - (c) Expose "method = trap | gear2" like SPICE.
- Initial conditions: the default is a DC operating point with C open and L shorted (solved by the same MNA engine with those stamps). "UIC"-style means skip the op point and use user-given capacitor voltages and inductor currents (0 if unspecified). Switch events at t=0: compute the op point with the pre-switch topology, then start the transient with the post-switch topology. This matches how textbooks pose "t=0⁻ / t=0⁺" problems and is pedagogically important.
- For homework checking, the transient answers for 1st/2nd-order RLC problems can be checked against closed-form solutions (see §8). A user-selectable small max step is often more trustworthy than aggressive LTE control.

### Gaps
- I couldn't read the ngspice manual's `.options` chapter, so the TRTOL, MAXORD, METHOD and UIC/.ic semantics and defaults are unverified from the primary source. The manual is at https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml (§11.1 options, §11.3 analyses).
- I found no primary-source exact LTE-to-step formula (e.g. SPICE's h = sqrt(trtol·ε/|DD|) form). The Ljubljana page gives the pseudocode only.

## 3. AC small-signal analysis

### Takeaway
AC analysis is the same MNA system with complex admittances: C → jωC, L → 1/(jωL). Nonlinear devices are replaced by their small-signal conductances/transconductances from the DC operating-point Jacobian. A sweep is just one complex LU solve per frequency point.

### Cited Findings
- SPICE has combined nonlinear DC, small-signal (AC) and nonlinear transient analysis in one nodal program since the original 1973 report. — [Nagel & Pederson, UCB/ERL M382 (1973)](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1973/ERL-m-382.pdf)
- Lcapy supports AC analysis with phasors (`phasor()`), sources defined by angular frequency, and jω-domain frequency responses. — [Lcapy overview docs](https://lcapy.readthedocs.io/en/latest/overview.html)
- math.js supports complex numbers as a first-class data type. — [mathjs GitHub README](https://github.com/josdejong/mathjs)

### Inferences
- (Standard knowledge, not verified this session.)
  - Phasor at one frequency: solve (G + jωC_mat)·x = b once and report the magnitude/angle of each node.
  - Bode: logarithmically spaced ω, plot 20log10|H| and ∠H, and unwrap the phase.
  - Linearization: diode g_d = I_D/(nV_T). BJT g_m = I_C/V_T and r_π = β/g_m. MOSFET (square law, saturation) g_m = 2I_D/V_ov and r_o = 1/(λI_D).
  - These come straight from the converged Newton Jacobian, so the AC engine reuses the nonlinear device code.
- Implementation in vanilla JS: store complex as separate re/im Float64Arrays and write a complex dense LU with partial pivoting by |z|. This is simpler and much faster than math.js Complex objects in inner loops. In Python, numpy/scipy handle complex natively.
- Student phasor homework usually states sources as amplitude∠phase. The UI should say clearly whether the amplitude is peak or RMS, because SPICE AC magnitudes are amplitudes (not RMS) by convention.

### Gaps
- I didn't fetch a primary AC-analysis lecture (e.g. MIT 6.336 or Berkeley EE219A). The linearization formulas above are standard but uncited.

## 4. Nonlinear DC: Newton-Raphson, device models, convergence aids

### Takeaway
Use Newton-Raphson on the MNA residual, re-stamping each nonlinear device's linearized companion (g_eq plus I_eq) every iteration. Use SPICE-style convergence tests (RELTOL 1e-3, VNTOL 1 µV, ABSTOL 1 pA), junction voltage limiting, and the fallback ladder plain NR → gmin stepping → source stepping. Device scope for students: Shockley diode, Ebers-Moll BJT (Gummel-Poon is overkill early on), and level-1 square-law MOSFET.

### Cited Findings
- ngspice convergence tolerances:
  - Branch currents: within 0.1% or 1 pA, whichever is larger. Node voltages: within 0.1% or 1 µV.
  - RELTOL default is 1e-3.
  - Voltage criterion: |v^(k+1) − v^(k)| ≤ RELTOL·v_max + VNTOL.
  — [ngspice HTML manual §1.4](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml)
- ngspice fallback order seen in logs: "Dynamic Gmin stepping failed. Note: starting source stepping". — [Qorvo forum log excerpt (secondary)](https://forum.qorvo.com/t/apparent-kirchhoff-s-law-violation/15048/2)
- Gmin stepping adds a conductance from every node to ground, which is separate from the GMIN conductance placed across pn junctions. — [LTspice help text reproduced at U. Ljubljana](https://lpvo.fe.uni-lj.si/wp-content/uploads/izobrazevanje/mag/nev/LTSpice/Simulator_options.txt)
- ITL1 (DC iteration limit) is reportedly 100, after which gmin stepping and then source stepping are tried. GMINSTEPS=0 disables gmin stepping. — [Electronic Design, "Taking a peek under the hood of your SPICE engine"](https://www.electronicdesign.com/technologies/industrial/boards/article/21774425/taking-a-peek-under-the-hood-of-your-spice-circuitsimulation-engine); [Efabless KB, "Overcoming SPICE convergence issues"](https://efabless.com/kb-articles/overcoming-spice-convergence-issues). Both are secondary.
- Applying backward Euler to reactive elements yields an algebraic system, which is solved by Newton-Raphson at each timestep. — [U. Ljubljana lecture 9](https://fides.fe.uni-lj.si/~zigar/CAO/_lectures/_09_lecture_more.php)
- CircuitJS nonlinear loop:
  - Restores the linear base matrix, calls `doStep()` on each element, and solves.
  - Breaks after one solve for linear circuits, or when `converged && subiter > 0`.
  - Subiteration cap: `(adjustTimeStep && timeStep/2 > minTimeStep) ? 100 : 5000`.
  - On failure it halves the timestep, restores the last node voltages, and retries.
  — [CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java)
- The definitive algorithm reference for SPICE2 (including junction limiting) is Nagel's thesis, "SPICE2: A Computer Program to Simulate Semiconductor Circuits," ERL-M520, May 9, 1975. — [Usenet 1987 post citing it](https://www.tuhs.org/Usenet/comp.lang.c/1987-February/032888.html); [Berkeley EECS tech report index](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1973/22871.html)

### Inferences
- (Standard knowledge, not verified this session.)
  - Diode: I = I_s(e^{V/(nV_T)} − 1). Companion g_d = (I_s/nV_T)e^{V/nV_T} and I_eq = I(V₀) − g_d·V₀. Add GMIN (≈1e-12 S) in parallel.
  - pnjlim (SPICE3 `DEVpnjlim`): if V_new > V_crit and |V_new − V_old| > 2nV_T, compress the step logarithmically, V_new = V_old + nV_T·ln(1 + (V_new−V_old)/(nV_T)), with V_crit = nV_T·ln(nV_T/(√2·I_s)).
  - MOSFETs use `DEVfetlim` to limit V_GS changes.
- Level-1 MOSFET:
  - Cutoff I_D = 0.
  - Triode I_D = k'(W/L)[(V_GS−V_T)V_DS − V_DS²/2](1+λV_DS).
  - Saturation I_D = ½k'(W/L)(V_GS−V_T)²(1+λV_DS).
- Ebers-Moll transport model: I_C = I_s(e^{V_BE/V_T} − e^{V_BC/V_T}) − (I_s/β_R)(e^{V_BC/V_T}−1). Gummel-Poon adds high-injection (IKF) and Early-effect (VAF) terms.
- EKV is a charge-based model continuous across weak and strong inversion. It's useful for smooth Newton behavior but not what ECE 201-level homework uses. Defer it.
- For an engineering-student homework checker (ECE 201 is linear circuits plus ideal op-amps), nonlinear devices are a later phase. When added, use "ideal diode" (piecewise-linear: on = 0 V or V_on source, off = open) as a separate solve mode with state enumeration or iteration. That matches textbook constant-voltage-drop answers far better than Shockley does.
- Source stepping is simple to implement: scale all independent sources by α from 0 to 1 and warm-start each Newton solve. Gmin stepping: add G_shunt from 1e-2 down to 1e-12 S per node.

### Gaps
- I didn't retrieve the SPICE3/ngspice source for `DEVpnjlim` or Nagel's thesis text. The pnjlim formula above is from memory and should be verified against `src/spicelib/devices/devsup.c` in the ngspice source.
- No primary EKV source was fetched (Enz, Krummenacher, Vittoz 1995, Analog IC & Signal Processing).
- I couldn't confirm ngspice defaults for GMINSTEPS/SRCSTEPS/ITL1 from the ngspice manual itself.

## 5. Linear algebra: dense vs sparse LU, size limits, JS libraries, complex, exact arithmetic

### Takeaway
Student circuits (under about 50–100 unknowns) are tiny. A hand-written dense LU with partial pivoting in Float64Array solves them in microseconds on a phone. Sparse LU (Sparse 1.3, KLU) only matters at thousands of nodes. For "clean textbook answers," exact rational Gaussian elimination (Fraction.js or BigInt rationals in JS, sympy.Rational or fractions.Fraction in Python) is feasible at this size. It lets the tool show 12/7 V instead of 1.7142857.

### Cited Findings
- ngspice offers two matrix solvers since version 42: the original Sparse 1.3, and KLU (optional, for large circuits). — [ngspice manual §1.1.2](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml)
- In ngspice, `src/maths/sparse/*` is MIT-style licensed and `src/maths/KLU/*` is LGPL v2. — [ngspice COPYING (current master)](https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/COPYING?format=raw)
- The 1975 MNA paper includes its own pivoting scheme and argues MNA gives fewer nonzeros and fill-ins than tableau. — [IBM Research page](https://research.ibm.com/publications/the-modified-nodal-approach-to-network-analysis)
- math.js:
  - License is Apache 2.0, but it bundles a JavaScript port of CSparse under LGPL-2.1+.
  - Supports numbers, bignumbers, bigints, complex numbers, fractions, units and matrices.
  — [mathjs GitHub](https://github.com/josdejong/mathjs)
- math.js `lusolve(A, b)` accepts a matrix or a precomputed `lup` decomposition. Its order/threshold parameters apply only to sparse matrices (same meaning as `slu`). — [math.js lusolve docs](https://mathjs.org/docs/reference/functions/lusolve.html)
- math.js `slu` is sparse LU, "best used for LU factorization when matrix M has no dense rows". — [math.js typings via jsdocs.io](https://www.jsdocs.io/package/mathjs)
- CircuitJS uses its own dense `lu_factor`/`lu_solve` with a permutation vector. For linear circuits it factors once in `stampCircuit()`, and for nonlinear circuits it re-factors on every subiteration. — [CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java)

### Inferences
- Dense LU cost is ~(2/3)n³ flops. n=100 is about 0.7 MFLOP, well under 1 ms in JS even on a phone. Sparse LU is unnecessary for homework-scale circuits. Choose dense Doolittle/Crout with partial pivoting and a condition-number estimate (or pivot-ratio check) to flag near-singular systems as "check your circuit" rather than returning garbage.
- MNA matrices with V sources have zeros on the diagonal of the current rows, so pivoting is mandatory (no plain Cholesky or no-pivot LU).
- Library choice in JS:
  - math.js: Apache-2.0 core. Note the LGPL-2.1+ CSparse port if you redistribute; using the npm package unmodified is fine under LGPL, but say so in the notices.
  - ml-matrix: MIT (from memory, not verified), with LU/QR/SVD, real only.
  - numeric.js: MIT, unmaintained since ~2012 (from memory, not verified).
  - Overall, ~150 lines of own LU code over Float64Array (real) plus a paired re/im version (complex) is simpler, faster and license-free. A rational version over BigInt fractions gives exact answers.
- Exact arithmetic: with integer or simple-decimal component values, rational elimination yields exact node voltages. Display both the exact fraction and the decimal. Fall back to floats when values are irrational (e.g. AC with ω) or numerators blow up. This is a real differentiator for "check my homework".
- In Python: numpy.linalg.solve (LAPACK getrf/getrs, partial pivoting) for floats, scipy.sparse.linalg.splu if ever needed, sympy Matrix.LUsolve or fractions.Fraction for exact solves.

### Gaps
- I didn't verify ml-matrix's and numeric.js's licenses or maintenance status from their repos.
- I didn't verify whether math.js `lusolve` works with Complex/Fraction element types (likely yes for dense, unknown for sparse).

## 6. Embedding existing engines: ngspice (WASM / shared lib), Xyce, Qucsator, SpiceSharp, CircuitJS

### Takeaway
ngspice compiled to WebAssembly already exists. EEcircuit/EEsim and the npm package `eecircuit-engine` run fully client-side and accept ngspice netlists, which gives SPICE-grade answers on a phone with no backend. ngspice's core is Modified BSD, with LGPL/MPL/GPL islands (KLU LGPL v2, numparam LGPL v2+, XSPICE table GPL v2+). PySpice (GPLv3) is the Python route via shared ngspice. The likely best architecture is a small own MNA engine (transparent, explainable, exact answers) plus ngspice-WASM as the trusted cross-check and the engine for nonlinear/transient work.

### Cited Findings
- EEcircuit:
  - A browser-based circuit simulator "based on ngspice," compiled to WebAssembly with Emscripten.
  - Netlists are compatible with ngspice. Results are plotted with webgl-plot or exported as CSV.
  - Processing is local in the browser; nothing is uploaded.
  - Formerly EEsim.dev. Upstream is eelab-dev/EEcircuit.
  — [EEcircuit GitHub (fork jamestiotio/EEcircuit)](https://github.com/jamestiotio/EEcircuit)
- EEsim, the predecessor, is by Dr Danial Chitnis (University of Edinburgh), indexed as MIT license, last push late 2023. It supports Chrome, Edge, Safari 15+ and Firefox 111+. — [Ecosyste.ms entry](https://awesome.ecosyste.ms/projects/219807); [EEsim README mirror](https://github-redirect.dependabot.com/danchitnis/EEsim); [Edinburgh open.ed.ac.uk](https://open.ed.ac.uk/?p=7391)
- EEsim's author says ngspice can be compiled to WASM "without any hacking". — [EEsim discussion #6](https://github.com/danchitnis/EEsim/discussions/6)
- npm `eecircuit-engine` (v1.7.0 README) API: `import { Simulation } from "eecircuit-engine"`, then `await sim.start()`, `sim.setNetList(netlist)` and `await sim.runSim()`. The netlist uses ngspice syntax, and the example runs `.tran`. — [eecircuit-engine README on jsDelivr](https://cdn.jsdelivr.net/npm/eecircuit-engine@1.7.0/README.md)
- ngspice license (current COPYING): "Modified BSD" for all source, test and example files except:
  - `src/tclspice.c`: LGPL v2.
  - `src/maths/sparse/*`: MIT-style.
  - `src/maths/KLU/*`: LGPL v2.
  - `src/osdi/*`: MPL 2.0.
  - `spicelib/devices/ndev`: public domain.
  - `src/xspice`: public domain, except `xspice/icm/table`, which is GPL v2+.
  - `src/frontend/numparam`: LGPL v2+.
  - `m4`: DFSG-compatible.
  - Manual: CC-BY-SA 4.0.
  — [ngspice COPYING, master](https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/COPYING?format=raw)
- Debian says ngspice source from version 28 onward is DFSG-compatible; earlier releases had non-redistributable parts that were relicensed or removed. — [Debian README.source (deepin mirror)](https://gitcode.com/deepin-community/ngspice/blob/master/debian/README.source)
- Shared ngspice (.so/.dll):
  - Lets a host send a netlist, run in a background thread, read data at each timepoint, stop on a condition, and alter parameters and resume.
  - The API is in `sharedspice.h` (manual ch. 19).
  - Bindings exist for Python (PySpice), Rust, Go, Octave, C++ (KiCad Eeschema) and others.
  — [ngspice shared library page](https://ngspice.sourceforge.io/shared.html)
- PySpice is GPLv3, interfaces ngspice and Xyce from Python, and is listed as GPL-3.0-or-later on conda-forge. — [PySpice docs v1.4](https://pyspice.fabrice-salvaire.fr/releases/v1.4/); [conda-forge](https://anaconda.org/conda-forge/pyspice); [GitHub PySpice-org/PySpice](https://github.com/PySpice-org/PySpice)
- Xyce is listed as GPL-3.0 and Qucs as GPL-2.0. — [pistack.xyz comparison (secondary, 2026)](https://www.pistack.xyz/posts/2026-06-08-self-hosted-spice-circuit-simulation-ngspice-qucs-xyce/). These are secondary only. Verify on Sandia's Xyce repo and the Qucs/Qucsator repo.
- SpiceSharp: MIT license, C#/.NET, "Most standard Spice-components are available," aims at Spice 3f5 compatibility, has CI on Windows/macOS/Linux, and has 1,248 commits. — [SpiceSharp GitHub](https://github.com/SpiceSharp/SpiceSharp)
- Falstad CircuitJS: GPL v2-or-later. Its design is described in §§1, 2 and 4 above: dense LU, node merging for wires, no LTE control, fixed or halving timestep, a 1e8 Ω floating-node tie, and a 1 mV default capacitor IC. — [CirSim.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CirSim.java); [CapacitorElm.java](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/src/com/lushprojects/circuitjs1/client/CapacitorElm.java)

### Inferences
- License implications:
  - Shipping ngspice-WASM is compatible with a permissively licensed app if the build excludes the GPL XSPICE table code model (or the app accepts GPL obligations) and honors LGPL for KLU/numparam. Static linking into one .wasm makes LGPL relinking obligations awkward, so the simplest path is to keep the .wasm as a separate, replaceable asset and publish the build scripts.
  - Check what eecircuit-engine's build includes (XSPICE? KLU?) and its own LICENSE before depending on it.
- PySpice is GPLv3. Using it in a FastAPI backend that's only run locally is fine (no distribution). Distributing the app with PySpice bundled makes that component GPLv3. Alternative: call ngspice directly via `ngspice -b` subprocess or ctypes on libngspice (BSD core), which avoids PySpice's GPL.
- CircuitJS (GPLv2+) code can't be copied into a non-GPL app. Its design ideas (node merging, topology error messages) are free to reuse.
- Falstad-style real-time simulation is great for intuition but not for homework answers. There's no LTE control, the 1e8 Ω DC capacitor and floating-node tie perturb results, and the 1 mV default capacitor initial voltage differs from textbook zero ICs.
- SpiceSharp (MIT, C#) is a clean, readable reference implementation of SPICE algorithms for porting ideas to JS, but it's not directly embeddable in a browser without .NET WASM (Blazor), which is heavy.
- Startup/size: I found no measured numbers. Expect ngspice WASM in the low-MB range plus init time. Measure it on a mid-range phone before committing. A lazy load (only when the user hits "verify with SPICE" or runs nonlinear/transient) avoids slowing the DC path.

### Gaps
- I couldn't find the eecircuit-engine license, its bundled ngspice version, .wasm byte size or init time. Check `npm view eecircuit-engine` and unpkg file listings.
- Xyce and Qucsator licenses came only from a secondary blog. Qucsator (the engine) vs Qucs (the GUI) license is not separately confirmed.
- I found no published accuracy study of CircuitJS vs SPICE. The "known inaccuracies" above are inferred from its source code constants.

## 7. Symbolic analysis: Lcapy, SymPy, SAPWIN; step-by-step nodal equations

### Takeaway
Lcapy (Python on SymPy) already does what a "show me the equations" feature needs. It prints the nodal, mesh and MNA equations, gives matrix form A·y = b, and computes Thevenin/Norton equivalents and phasor/Laplace solutions symbolically for linear time-invariant circuits. It can't analyse nonlinear devices. A FastAPI backend with Lcapy is a strong fit for the explanation layer, with numeric solving kept in the client.

### Cited Findings
- Lcapy capabilities:
  - Symbolic analysis of linear time-invariant circuits, including switching circuits treated as sequences of initial-value problems.
  - Outputs mesh, nodal, MNA and state-space equations, and draws schematics via LaTeX Circuitikz.
  - Thevenin/Norton conversions via `thevenin()`/`norton()` and circuit `thevenin(Np, Nm)`.
  - Laplace/time-domain transients with `ILT()`, and AC phasors.
  - Supports simple op-amps without saturation. It "cannot directly analyse non-linear devices such as diodes or transistors" and points to PySpice for those.
  — [Lcapy overview docs](https://lcapy.readthedocs.io/en/latest/overview.html)
- Lcapy `NodalAnalysis(cct.laplace())`:
  - `nodal_equations()` returns the KCL equation at each node.
  - `matrix_equations()` takes forms 'A y = b', 'b = A y', 'Ainv b = y' and 'y = Ainv b'.
  - It is "primarily for showing the equations" and works only for dc, ac or laplace domains.
  — [Lcapy NodalAnalysis API docs](https://lcapy.readthedocs.io/en/latest/_autosummary/lcapy.nodalanalysis.NodalAnalysis.html)
- Lcapy circuit analysis uses MNA with SPICE-like netlists, and node voltages are accessed as e.g. `cct['fred'].V`. — [Lcapy modules docs](https://lcapy.readthedocs.io/en/stable/modules.html); [Lcapy MNA class](https://lcapy.readthedocs.io/en/latest/_autosummary/lcapy.mna.MNA.html)
- Peer-reviewed description: "Lcapy: symbolic linear circuit analysis with Python," PeerJ Computer Science (article cs-875). — [PeerJ](https://peerj.com/articles/cs-875)
- Nullor-based symbolic MNA for op-amp circuits is a known technique, covered in Biolek et al. — [EurekaSelect chapter](https://www.eurekaselect.com/chapter/4235)

### Inferences
- A practical split:
  - The JS client builds the netlist, and its own MNA engine gives instant numeric results.
  - The backend `/explain` endpoint runs Lcapy to return the LaTeX nodal equations, the matrix form, a symbolic Thevenin equivalent and an exact solution.
  - Results render with KaTeX/MathJax on the phone.
- Lcapy's NodalAnalysis gives equations, not a narrated "step-by-step" solution. The app has to sequence the steps itself (pick reference node → label unknowns → KCL per node → supernode for floating V sources → solve), but each step's content can come from Lcapy/SymPy.
- A simpler alternative without Lcapy: the own JS MNA engine can emit its stamped equations as text ("Node 2: (v2−v1)/R1 + v2/R2 = 0"), because each stamp knows its element. Exact rational solving then gives clean answers. This covers ECE 201 needs with no Python at all. Use Lcapy only for symbolic (letters-not-numbers) results and Laplace-domain work.
- Lcapy's own license wasn't confirmed this session. I believe it's LGPL-2.1, but that needs checking on GitHub `mph-/lcapy`.

### Gaps
- I couldn't confirm Lcapy's license, performance (SymPy can be slow on circuits with more than about 10 symbolic elements), or whether it handles dependent sources in `nodal_equations()`.
- I found nothing current on SAPWIN (a Windows symbolic analysis program from Univ. of Florence). It seems legacy, closed and not embeddable.

## 8. Verification: how to test the solver

### Takeaway
Test in three layers. (1) Analytic unit tests per stamp and per topology (dividers, bridges, superposition, Thevenin, op-amp configurations, RC/RL/RLC closed forms). (2) Differential tests against ngspice on the same netlist (ngspice-WASM in CI or the browser, or `ngspice -b` in Python) using SPICE's own tolerance definitions. (3) Golden textbook problems with official answers. Homebase already uses "answer keys come from official solutions or code-computed answers," so the simulator must reproduce official answers before it's trusted as a checker.

### Cited Findings
- ngspice's convergence criteria (RELTOL 1e-3, 1 µV voltage, 1 pA current) define what "agreement" means for a SPICE-grade result. — [ngspice manual §1.4](https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml)
- ngspice can be driven programmatically (shared lib) to send netlists and read vectors, and PySpice wraps it in Python. — [ngspice shared library page](https://ngspice.sourceforge.io/shared.html); [PySpice docs](https://pyspice.fabrice-salvaire.fr/releases/v1.4/)
- eecircuit-engine runs ngspice netlists in JS (`runSim()`), so a browser/Node test harness can compare outputs without a native install. — [eecircuit-engine README](https://cdn.jsdelivr.net/npm/eecircuit-engine@1.7.0/README.md)
- Lcapy gives exact symbolic solutions for linear circuits, which makes it an independent oracle for the numeric engine. — [Lcapy overview](https://lcapy.readthedocs.io/en/latest/overview.html)

### Inferences
- Concrete test suite:
  - (a) Per-stamp tests with tiny circuits whose answers are known exactly, using rational mode and requiring exact equality.
  - (b) Property tests on random resistor networks: the numeric solution satisfies KCL at every node to 1e-12 relative, Tellegen's theorem (Σ v·i = 0) holds, reciprocity holds for passive R networks, and superposition matches the sum of single-source solves.
  - (c) Thevenin check: V_oc and I_sc from two solves vs R_th from test-source injection.
  - (d) Transient: an RC step should give v(t) = V(1−e^{−t/RC}). Check the error scales as O(h) for BE and O(h²) for trap. That order-of-accuracy convergence test is the standard way to verify an integrator. Underdamped RLC should be compared to the closed form.
  - (e) AC: an RC low-pass should show −3 dB at f = 1/(2πRC) with phase −45°.
  - (f) Fuzz differential tests vs ngspice on random linear netlists at matching tolerance.
  - (g) A golden set of textbook/course problems with official solutions, e.g. Homebase ECE 201 problem keys.
- Error-path tests matter as much as answer tests. Every malformed circuit class (floating node, V loop, I cutset, op-amp without feedback, shorted V source) should produce the specific friendly message, not a NaN.

### Gaps
- I found no published standard benchmark suite for educational simulators. The classic SPICE benchmark decks (e.g. CANCER/MCNC) target performance and robustness, not textbook correctness, and I didn't fetch them.
- I didn't find MIT 6.336 or Berkeley EE219A notes in this session. They'd be good extra primary sources for the integration-method order-of-accuracy tests.
