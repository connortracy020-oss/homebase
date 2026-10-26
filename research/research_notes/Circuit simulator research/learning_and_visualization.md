# Circuit Simulations and Visualizations for Learning: Education Research and Design Ideas

Scope: research input for an educational analog circuit simulator (2D schematic editor plus a truthful 3D view) inside a student's local study app (Homebase, ECE 201). "Evidence" means a peer-reviewed or conference study with data. "Opinion" means an essay, a practitioner guide or an anecdote. Several primary PDFs (Bodensiek et al. 2019, Crouch et al. 2004, Keller et al. 2006, Sambamurthy & Edgcomb 2018) were read in full. The others were read only as an abstract or a secondary summary, and those entries say so.

## 1. Well-documented student misconceptions about DC and AC circuits

### Takeaway
The best-documented difficulties are these. Students treat current as the primary, "used up" quantity and treat the battery as a constant-current source. They confuse current with voltage. They reason locally or sequentially (in the order current "reaches" each part) instead of seeing the circuit as one system. They have little working idea of potential. These patterns show up across populations and survive traditional instruction. AC and phasor difficulties (phase, lead/lag, instantaneous vs RMS, what is "alternating") are documented but less studied. I found no education research on passive-sign-convention or ground misconceptions specifically.

### Cited Findings
**Foundational DC studies**
- Cohen, Eylon & Ganiel (1983, Am. J. Phys. 51, 407) gave a diagnostic questionnaire to 145 high-school students and 21 physics teachers. Students treat current as the primary concept and treat potential difference as a *result* of current rather than its cause, which leads to misapplied V=IR. They also picture the battery as a constant-current source and understand emf and internal resistance poorly. (Read as the abstract and secondary summaries only.) — [PER Central record](https://www.per-central.org/items/detail.cfm?ID=2333); [IOP Spark summary](https://spark.iop.org/few-students-can-clearly-distinguish-ideas-electric-current-and-potential-difference)
- McDermott & Shaffer (1992, Am. J. Phys. 60(11), Part I pp. 994–1003, Part II pp. 1003–1013) is the research-based investigation of student understanding of circuits that led to the *Tutorials in Introductory Physics* / *Physics by Inquiry* circuit materials. Part II covers a lab-based curriculum built from that research. I could not get the full text, so its specific findings are not reproduced here. — [CompADRE Part I](https://www.compadre.org/portal/items/detail.cfm?ID=2722); [CompADRE Part II](https://www.compadre.org/portal/items/detail.cfm?ID=2877)
- Engelhardt & Beichner (2004, Am. J. Phys. 72, 98–115) built DIRECT, a 29-item multiple-choice test with misconception distractors taken from free-response answers. Students, especially women, held *multiple* misconceptions even after instruction. In interviews the idea students used most was that "the battery is a constant source of current." Students focused on current and gave properties of current to voltage and/or resistance. They could, however, easily turn realistic circuit drawings into schematics. — [arXiv physics/0304040](https://arxiv.org/abs/physics/0304040); [PhysPort DIRECT page](https://www.physport.org/assessments/assessment.cfm?A=DIRECT)
- Common misconceptions in the literature: "local thinking" (for example, current splits evenly at any junction whatever the branch resistances) and "sequential reasoning" (Closset 1983: an element affects only devices "after" it in the direction of current). Bodensiek et al. link these partly to a missing grasp of potential as a global concept. — [Bodensiek et al., arXiv 1805.02522](https://arxiv.org/abs/1805.02522), citing Cohen 1983, Engelhardt 2004 and Closset 1983

**Engineering (ECE) specific**
- Sambamurthy & Edgcomb (ASEE 2018) is a systematic review of 15 studies (1997–2018) of first-year circuit-analysis misconceptions. It finds 20 misconceptions in 8 categories:
  - Physics: charge used up; current used up; voltage used up; voltage source "provides charge" or "supplies current"; term confusion such as voltage as current that flows, voltage as the "strength of current", voltage as pressure; the water-pipe metaphor leading to "current pools behind resistors"
  - Math: algebra errors; "sinusoidal means sine"; wrong cosine angles
  - Sequential reasoning: failure to consider local changes in the context of the whole circuit, cited by 6 articles
  - Ohm's law: blind or inappropriate application, cited by 7 articles; I=VR
  - Series/parallel: misidentifying series and parallel
  - Open/short circuits: open/closed treated as on/off; effects of resistance and voltage across opens and shorts
  - KVL/KCL: belief that the direction of mesh currents matters; misapplied laws
  - AC: identifying what is alternating; interpreting phase behavior

  Term confusion was the most cited physics misconception (4 articles). Notably, *none* of the 15 studies tried to remediate the misconceptions. — [Sambamurthy & Edgcomb 2018, ASEE (PDF)](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Smaill et al. (IEEE Trans. Educ. 55(1), 29–35, 2012, plus ASEE/AaeE 2008–2009) built an entry-level electricity test (20 MCQ + 2 free response) and gave it to more than 1600 first-year EE students in New Zealand and the US between 2007 and 2009. The review lists it as evidence for sequential-reasoning, Ohm's-law-misapplication and algebra-error categories. (Read through the review, not the original.) — [Sambamurthy & Edgcomb 2018](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Sangam & Jesiek analyzed 5 circuits textbooks for conceptual gaps (IEEE Trans. Educ. 58(3), 194–202, 2015). They found textbooks can carry misconceptions such as "voltage source provides charge" and "charge used up". In a 2012 ASEE study they gave DIRECT to about 150 first-year honors engineering students before and after a one-week circuits module. Prior education and intended major (ECE vs non-ECE) significantly predicted scores. — [ASEE PEER 2012](https://peer.asee.org/conceptual-understanding-of-resistive-electric-circuits-among-first-year-engineering-students); [review citing the TOE paper](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Circuits Concept Inventory (CCI), Helgeland & Rancour (Foundation Coalition), is an ECE-oriented inventory but used less than DIRECT: 1 of the 15 reviewed papers used it, against 4 for DIRECT. Ogunfunmi & Rahman (ISCAS 2010) proposed another electric-circuits concept inventory. — [Sambamurthy & Edgcomb 2018](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Kautz (SEFI 2011) studied first-year EE DC/AC courses. Difficulties with Kirchhoff's laws and with *phase relationships between AC signals* were prevalent and persistent, and largely independent of student population or instructor under traditional lectures. He developed tutorial-style worksheets in response. Timmermann & Kautz (REES 2015) studied open switches and open circuits. — [search summary of SEFI 2011 paper](https://sefi.be/wp-content/uploads/2017/10/081-sum.pdf); [review](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)

**AC / phasors / capacitors**
- At Swinburne, Daniel et al. (2012) found persistent trouble with phasors: lead vs lag, and instantaneous vs RMS values. A pre-test averaged 38% (N=86). They responded with interactive lecture demonstrations using clickers. — [UTS OPUS record](https://opus.lib.uts.edu.au/handle/10453/153842)
- Coppens, De Cock & Kautz (SEFI 2012) interviewed students on RC filters. Difficulties: phase, frequency dependence of impedance, and the physical meaning behind the math representation. — [search summary of SEFI paper](https://sefi.be/wp-content/uploads/2017/10/081-sum.pdf)
- Biswas et al. (Vanderbilt 1998 tech report) interviewed 18 students on AC circuits. Students thought voltage and current "switch on and off" or flip positive/negative, misidentified what is alternating, and misread phase behavior. — [review](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Capacitors. The AP Physics C: E&M 2021 Chief Reader report says students often did not reason about charge flow, and did not explain why current stops once a capacitor is fully charged. Other studies report confusing capacitance with stored charge or with voltage (about one-third in a Philippine sample held "C depends on Q and V") and trouble describing RC charging and discharging. These are lower-tier sources: an exam report and proceedings. — [AP Chief Reader report 2021](https://apcentral.collegeboard.org/media/pdf/ap21-chief-reader-report-physics-c-em.pdf); [SPP proceedings](https://proceedings.spp-online.org/article/view/SPP-2004-3G-01)
- Thacker et al. (1999, Am. J. Phys. 67, 25) found that instruction on transients built on a macro–micro relationship produced better understanding. (Cited by Bodensiek et al.; not read directly.) — [Bodensiek et al.](https://arxiv.org/abs/1805.02522)

### Inferences
- The simulator's main targets should be: (a) current conserved around a loop, never used up; (b) a source fixes *voltage*, and current follows from the whole network; (c) potential as a global, node-level quantity; (d) whole-circuit effects, where changing one element changes everything, including "upstream" parts. Each maps onto a visual that can be checked: equal current-marker speed before and after a resistor, node height or color, global re-render on any edit.
- Because textbooks and the water metaphor themselves carry misconceptions (Sangam & Jesiek; the review), the app's own explanations and analogies need the same scrutiny as the physics engine.
- The research gap is in remediation, not diagnosis: the review found no remediation studies in its corpus. A prediction-first simulator lines up with exactly that gap.
- DIRECT is the most-used validated instrument. Its items (bulb brightness orderings, effect of adding a bulb in parallel, open/short) make good templates for built-in "predict" challenges. (Inference; do not copy items, since the instrument is access-controlled via PhysPort.)

### Gaps
- No peer-reviewed research found on **passive sign convention** errors or **ground/reference-node** misconceptions specifically. Only practitioner forum and Wikiversity material surfaced. Instructor experience says these are common in ECE 201-type courses, but that is unsourced here.
- Full texts of McDermott & Shaffer 1992, Cohen et al. 1983 and Smaill et al. 2012 were not read, so prevalence percentages from them are not given.
- Phasor research is thin: a few conference papers. No validated phasor concept inventory was found.

## 2. PhET Circuit Construction Kit (CCK) studies: simulation vs real labs, guidance level

### Takeaway
In a large intro course, students who did the DC-circuits lab with CCK, which shows moving electrons, beat students who used real bulbs and meters. That held on conceptual questions and on building and explaining a *real* circuit (Finkelstein et al. 2005). In lecture, showing CCK beat a real-equipment demo. Removing CCK's current animation did *not* change exam scores (Keller et al. 2006). PhET interview work finds that minimal but nonzero guidance gives the most productive exploration, and heavy step-by-step guidance suppresses exploration.

### Cited Findings
- Finkelstein, Adams, Keller, Kohl, Perkins, Podolefsky, Reid & LeMaster (2005, Phys. Rev. ST PER 1, 010103), "When learning about the real world is better done virtually". In the DC-circuits lab of a large second-semester intro course, one group used real bulbs, meters and wires, and the other used CCK, which explicitly models electron flow. The CCK group did better on conceptual questions, and better at assembling a real circuit and describing how it works. (Read as abstract only; numeric results not retrieved.) — [APS abstract](https://journals.aps.org/prper/abstract/10.1103/PhysRevSTPER.1.010103); [DOAJ record](https://doaj.org/article/a86a7ac0a72641f2a000e4e2c86e5d61)
- Keller, Finkelstein, Perkins & Pollock (PERC 2006, AIP Conf. Proc. 883, 121–124), lecture study. Showing CCK instead of a real demonstration during Peer Instruction gave a 47% larger relative gain (11% absolute) in conceptual understanding. On one set of questions, CCK viewers went from 59.8% to 92.1% correct, against 61.2% to 83.1% for the real-demo group. — [Keller et al. 2006 (PDF)](https://data.issuelab.org/resources/1363/1363.pdf)
- Keller et al. 2006, lab study. In an inquiry lab, a "Current" group (N=65, electron dots on) and a "No Current" group (N=90, dots removed) used CCK. They performed similarly on common exam questions: for example 57.4% vs 56.5%, and 75.0% vs 73.7% (p=0.8) on another subset. Both preferred CCK to real equipment, and the No-Current group rated the CCK lab *more* positively. — [Keller et al. 2006 (PDF)](https://data.issuelab.org/resources/1363/1363.pdf)
- Keller et al. 2005 (PERC, AIP 818, 109–112) compared CCK with real equipment for completing two *Tutorials in Introductory Physics* DC worksheets in recitation. (Read as abstract only.) — [CompADRE](https://www.compadre.org/portal/items/detail.cfm?ID=5272)
- Adams, Paulson & Wieman (PERC 2008, AIP 1064, 59–62), from about 250 PhET student interviews: the type of guidance shapes engagement, and "minimal but nonzero guidance" promotes the most engaged exploration and learning. — [CU VIVO record](https://vivo.colorado.edu/display/pubid_118958); [PDF mirror](https://clixplatform.tiss.edu:443/phet/publications/PERC_Interview_Guidance.pdf)
- Chamberlain, Lancaster, Parson & Perkins (2014, Chem. Educ. Res. Pract.), with N=210 on PhET Acid–Base Solutions (not CCK), found students using unprompted features fell sharply as guidance increased: 85% under light guidance, 68% moderate, 9% heavy. Light-guidance students explored more and attended more to their interactions. — [RSC article](https://pubs.rsc.org/en/content/articlehtml/2014/rp/c4rp00009a)

### Inferences
- The CCK advantage in the lab may come from several features at once: an idealized, constrained environment with no loose wires or blown bulbs, visible "invisible" quantities, and fast iteration. Keller's null result for the dots suggests the electron animation alone is *not* the active ingredient. That fits the argument that the animation is not a costly feature but also not a magic one.
- For a homework-integrated simulator: give a question or goal with light scaffolding ("make bulb B brighter than A without changing the battery") rather than click-by-click recipes. Then require a prediction (see section 4).
- These results come from intro *physics* (bulbs, qualitative). Transfer to ECE 201-style quantitative analysis (nodal, mesh, Thévenin, phasors) is not directly established.

### Gaps
- Exact numeric results from Finkelstein et al. 2005 (exam percentages, lab-practical times) could not be retrieved; the APS and DOAJ pages blocked or summarized them.
- I found no controlled CCK-style study for AC, transient or phasor simulators at the university ECE level.

## 3. Visual encodings: voltage as height or color, charge-flow animation, power as glow, analogies, scopes, phasors

### Takeaway
The strongest positive evidence is for **potential-centred representations**: voltage as height in a gravitational analogy, voltage as color, or voltage as "electric pressure". A 790-student controlled study of a potential/pressure curriculum found d=0.94. A small 3D-height-model study found large pre/post gains for series circuits but not for parallel or mixed circuits. **Animated charge dots** are popular, but the one controlled test found no learning effect from them. General animation research warns that animation is often no better than well-made static sequences unless it is interactive and controllable. Analogies such as water are "generative": they shape students' inferences, including wrong ones like current pooling behind resistors.

### Cited Findings
**Voltage as height / potential landscape**
- Bodensiek, Sonntag, Glawe & Müller (2019, J. Phys.: Conf. Ser. 1286, 012010) used 3D-printed height models of series, parallel and mixed DC circuits in which electric potential is height, with color bands every 1 cm = 1 V. In a 90-minute intervention with year-8 students (N=59; pre/post, no control group, after prior traditional instruction), results were:

  | Measure (test item) | Pre-test | Post-test |
  |---|---|---|
  | Correct voltage definition | 24% | 70% |
  | Gave source voltage between every pair of points in a one-bulb circuit (wrong) | 75% | 5% |
  | All three voltages correct (one-bulb circuit) | 5% | 37% |
  | 3 V across each of two series bulbs | 29% | 63% |
  | All four series voltages correct | 3% | 29% |

  73% and 66% colored the circuits correctly by potential. There was **no significant improvement for parallel or mixed circuits**, and students still confused potential with voltage. The authors recommend teaching potential and voltage separately. They report "almost no confusion of current and voltage" after the intervention. — [arXiv 1805.02522](https://arxiv.org/abs/1805.02522) (full text read)
- Bodensiek et al. flag a **sign problem** for height plus electron models. Electrons (q = −e) would have to move *uphill* from the − terminal to the + terminal, so the authors "redefine the electron charge as positive" in the model. They also warn that "work per charge" invites a "rucksack" picture of charges carrying energy, when the field carries the energy (Poynting) and electrons drift passively. They recommend filling the whole conductor with beads to show *collective* motion, not lone electrons. — [arXiv 1805.02522](https://arxiv.org/abs/1805.02522)
- Gleixner (1998, LMU Munich PhD) made an earlier height model: terminals on pillars whose height and color match potential, with equipotential terminals joined by same-colored cables. (Cited by Bodensiek et al.) — [arXiv 1805.02522](https://arxiv.org/abs/1805.02522)
- The MIT 8.02 lab uses a topographic-map analogy: equipotentials as contour lines, field lines perpendicular to them. — [MIT OCW 8.02 Experiment 1](https://www.ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2007/5f7d6bfe8d781aa002b0edda097bc191_experiment1.pdf)

**Voltage as electric pressure / potential-focused curricula**
- Burde & Wilhelm (2020, Phys. Rev. PER 16, 020153) taught a simplified electron-gas model with voltage as an "electric pressure difference" across a resistor, building on intuitions from air mattresses and bicycle tires. It was a quasi-experimental field study with 790 Frankfurt students and a two-tier diagnostic. It was more effective than traditional teaching, with effect size d=0.94. A binational replication is under way. — [APS abstract](https://journals.aps.org/prper/abstract/10.1103/PhysRevPhysEducRes.16.020153); [Univie project page](https://teaching-physics.univie.ac.at/forschung/publikationen/publikationen-detailansicht/pure/404ac564-e498-4143-b3fd-918a790324f1/show/publ/Pure)
- Conflict: the systematic review lists "voltage is pressure" as a *term-confusion misconception* (from Bledsoe 2007). Burde & Wilhelm use pressure *difference* as a productive model. The difference is between pressure as a property of current and pressure difference as the cause of current. — [Sambamurthy & Edgcomb 2018](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf) vs [Burde & Wilhelm 2020](https://journals.aps.org/prper/abstract/10.1103/PhysRevPhysEducRes.16.020153)
- Rosenthal & Henderson (2006, Am. J. Phys. 74, 324–328), "Teaching about circuits at the introductory level: An emphasis on potential difference", is another potential-first approach. Its results were not retrieved. — [arXiv 1006.5157 reference list](https://arxiv.org/pdf/1006.5157)

**Animated charge flow**
- Keller et al. 2006: removing CCK's electron-dot animation did not change conceptual exam performance (about 57% both ways; 75.0% vs 73.7%, p=0.8). — [Keller et al. 2006](https://data.issuelab.org/resources/1363/1363.pdf)
- Falstad's simulator: "moving yellow dots indicate current", with a current-speed slider; voltage is color-coded green (+), gray (ground), red (−); scopes show voltage (green) and current (yellow) for a component. Power is colored only in a power-factor demo, where red means consuming and green means supplying. The directions page does not say whether the dots are conventional or electron flow. No peer-reviewed learning study of Falstad was found; evidence is anecdotal (opinion). — [Falstad directions](https://www.falstad.com/circuit/directions.html); [Deusto OLAREX guide](https://weblab.deusto.es/olarex/cd/UD/OHMS_LAW_EN/use_of_the_falstad_simulator_for_electronic_circuits.html)

**Animation in general**
- Tversky, Morrison & Bétrancourt (2002, Int. J. Human-Computer Studies 57, 247–262) reviewed the literature. Animation shows no clear advantage over static graphics in general. Many positive studies compare against unequal static material, and fair comparisons with a sequence of stills mostly show no benefit. Animations are often too fast or complex to perceive accurately, and people think of continuous events as discrete steps. "Judicious use of interactivity" may overcome both problems. — [Tversky et al. 2002 (PDF)](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf)

**Analogies (water, crowds)**
- Gentner & Gentner (1983, in *Mental Models*): water-flow vs "teeming crowds" analogies for electricity. People import the structure of the source domain and it shapes their inferences, which supports the "generative analogy" over the "surface terminology" hypothesis. (Read as summary only.) — [Gentner & Gentner PDF](https://groups.psych.northwestern.edu/gentner/papers/GentnerGentner83.pdf); [DTIC tech report](https://apps.dtic.mil/sti/html/tr/ADA115300/index.html)
- The water-pipe metaphor is listed as an "incomplete metaphor" that produced "current pools behind resistors" (Bledsoe 2007), and textbooks carry it too (Sangam & Jesiek). — [Sambamurthy & Edgcomb 2018](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)

**Multiple representations**
- Ainsworth's DeFT framework (2006, Learning & Instruction 16(3), 183–198) says multiple representations can complement each other, constrain each other's interpretation, and build deeper understanding through abstraction and relation. Its design implication is that the learner must be supported in translating between representations. (Read as abstract/secondary only.) — [Nottingham repository](https://nottingham-repository.worktribe.com/output/23577631/deft-a-conceptual-framework-for-considering-learning-with-multiple-representations); [OU: applying DeFT to simulations](https://oro.open.ac.uk/34586)

### Inferences
- **3D "truthful" view.** Height = node potential (relative to the chosen ground) has the best support. Implementation rules that follow from the evidence:
  - Every wire segment on one node sits at the same height: an equipotential "plateau".
  - Height changes happen *only* across elements.
  - Ideal sources are vertical "lifts".
  - Moving the ground node shifts the whole landscape rigidly, which teaches that only differences matter and addresses ground confusion.
- Bodensiek's null result for parallel and mixed circuits suggests the height view needs explicit tasks that compare branch currents. The 2D view could show current magnitude by marker *density or speed*, with KCL checks at junctions.
- **Charge-marker animation.** Treat it as optional and secondary: no measured learning effect, but students like it. If included:
  - Use conventional current by default, with an explicit toggle for electron flow.
  - Keep marker speed proportional to current, with a log or adjustable scale, as Falstad does.
  - Keep markers *uniformly spaced and conserved* so they never bunch "behind" resistors.
  - In the height view, avoid the sign confusion of conventional current flowing "downhill" through resistors while electrons go "uphill", by labelling which one is shown.
- **Avoid red/green as the only voltage encoding** (Falstad's scheme), since it is a common color-vision-deficiency pair. Use a diverging, colorblind-safe palette plus numeric labels.
- **Power as glow or heat** fits Bodensiek's warning about the rucksack model. Glow should map to I·V *at the element*, with sources shown as supplying (negative absorbed power under the passive sign convention). A signed color (absorbing vs delivering) can teach the passive sign convention directly. This is my design inference; there is no direct study.
- **Scopes and phasors.** The documented AC difficulties are phase, lead/lag and instantaneous vs RMS. That argues for linked views: a rotating phasor plus its projected time-domain trace on a scope, with a shared time cursor. That is DeFT's complement + relate. Unstudied for this population; inference.

### Gaps
- No controlled study found on a *software* 3D height-map of circuits (only physical 3D prints and Mathematica animations). No evidence found on "rollercoaster" or "rope" models specifically.
- No study found isolating "power as glow" or color-coded voltage on a schematic as a learning variable.
- No empirical study found on phasor animations or oscilloscope-trace visualizations for learning.

## 4. Interactivity: explorable explanations, Falstad, predict-observe-explain

### Takeaway
The best-quantified result is that **prediction before observation** substantially increases learning from demonstrations. Passive observation adds almost nothing. Bret Victor's explorable-explanation ideas (reactive documents, explorable examples, multiple linked representations) are influential design *opinion*, not evidence. Guidance should be light but present (PhET).

### Cited Findings
- Crouch, Fagen, Callan & Mazur (2004, Am. J. Phys. 72, 835) tested 7 demonstrations with an end-of-semester test. Normalized improvement over the no-demo control:

  | Mode | N | Correct outcome | Correct explanation | Class time per demo |
  |---|---|---|---|---|
  | No demo (control) | 297 | 61% | 22% | — |
  | Observe | 220 | 70% | 24% (n.s.) | 11 min |
  | Predict | 179 | 77% | 30% | 13 min |
  | Discuss | 158 | 82% | 32% | 21 min |

  Predicting "doubles" the normalized improvement and effect size for outcomes and "nearly quadruples" them for explanations, at about 2 extra minutes. Discussion added little more for 8 more minutes. Even with prediction, fully correct explanations stayed modest. Demos designed around known difficulties (Interactive Lecture Demonstrations) did better in a follow-up. — [Crouch et al. 2004 (PDF)](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf); [CompADRE](https://www.compadre.org/IntroPhys/items/detail.cfm?ID=2329)
- Detail from the same study: predict-mode students chose from a list of possible outcomes and were right 26% of the time. Discuss-mode students predicted open-ended and were right 41% of the time. Listing options may have *increased* prediction errors. — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf)
- Bret Victor, *Explorable Explanations* (2011 essay; opinion) proposes:
  - "reactive documents", where the reader changes the author's assumptions and sees results update
  - "explorable examples" embedded in text, with several representations shown at once
  - "contextual information" on demand

  He argues text should be "an environment to think in". A 2024 postscript says the term has drifted to mean any interactive graphic, when he meant arguments backed by editable models. — [worrydream.com/ExplorableExplanations](https://worrydream.com/ExplorableExplanations/)
- Tversky et al. (2002): interactivity (learner control of pace and viewpoint) is the proposed remedy for animation being too fast or complex. — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf)
- PhET: minimal but nonzero guidance works best; heavy guidance cut use of unprompted features from 85% to 9%. — [Adams et al. 2008](https://vivo.colorado.edu/display/pubid_118958); [Chamberlain et al. 2014](https://pubs.rsc.org/en/content/articlehtml/2014/rp/c4rp00009a)
- Falstad: immediate continuous simulation with live dots, color and scopes; widely used in courses. A practitioner guide stresses students must understand it is a simulation, and pairs it with hand analysis and a remote real lab (practice, not evidence). — [Deusto guide](https://weblab.deusto.es/olarex/cd/UD/OHMS_LAW_EN/use_of_the_falstad_simulator_for_electronic_circuits.html)

### Inferences
- Default interaction loop: **commit a prediction (free-form number or sketch), then reveal the simulation, then reconcile.** Prefer open-ended or numeric predictions over multiple choice, given Crouch's list effect.
- Sliders with immediate re-solve suit "what-if" exploration *after* a prediction has been committed. Before that, live numbers would short-circuit the prediction.
- Add a short "explain the discrepancy" prompt after a wrong prediction; the discuss mode's benefit came from resolving conflicts.

### Gaps
- No controlled study found comparing slider-driven immediate feedback with step-wise evaluation in circuit simulators specifically.

## 5. Integrating the simulator with homework practice

### Takeaway
Direct evidence is limited to the prediction effect (Crouch) and the guidance findings (PhET). Hiding solver output until a prediction or hand-solution is committed follows from those, but I found no study that tests "simulate-to-check homework answers" in ECE courses.

### Cited Findings
- Prediction before outcome improves conceptual explanations at low time cost. — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf)
- Sambamurthy & Edgcomb suggest qualitative questions to counter blind Ohm's-law use, for example how raising one series bulb's resistance affects the others, and diagnosing with DIRECT early to set priorities. — [Sambamurthy & Edgcomb 2018](https://zybooks.com/wp-content/uploads/2024/05/Paper__Systematic_literature_review_of_misconceptions_in_linear_circuit_analysis__1_.pdf)
- Kautz reported that collaborative worksheets targeting identified difficulties were the response to persistent errors. — [SEFI summary](https://sefi.be/wp-content/uploads/2017/10/081-sum.pdf)

### Inferences
- **Prediction gate.** The solver's node voltages and branch currents stay hidden until the student enters a value or a qualitative ranking ("brighter / dimmer / same"). Then reveal, and highlight where the prediction and the simulation differ.
- **Hand-solve check mode.** The student enters their nodal or mesh answers. The simulator overlays them on the circuit (height and arrows) and flags which KCL/KVL equation is violated, rather than just showing "wrong".
- Matching Homebase's rule that keys come from official or code-computed answers: the simulator's computed values can serve as a code-computed key for circuits it builds.
- Log predictions against outcomes per misconception tag (current used up, sequential, open/short, phase), so spaced review can resurface weak concepts.
- Mix qualitative "what changes if…" items with quantitative ones, since blind Ohm's-law use comes from weak qualitative understanding.

### Gaps
- No peer-reviewed study found on simulation-checked homework or answer-hiding scaffolds in circuits.

## 6. Accessibility and mobile considerations

### Takeaway
PhET has the most developed model for accessible simulations: a parallel DOM for screen readers, keyboard navigation, interactive description, sonification, voicing and haptics. It is documented through project reports and a thesis, not learning-outcome studies. I found no research on mobile or touch use of circuit simulators.

### Cited Findings
- PhET accessibility features: alternative input, screen-reader auditory description, voicing, sonification (non-speech sound) and haptics. An NSF project targets students with sensory, mobility or learning disabilities. — [CADRE project page](https://cadrek12.org/projects/ramping-accessibility-stem-inclusively-designed-simulations-diverse-learners); [Accessing Higher Ground talk](https://accessinghigherground.org/accessible-interactive-simulations-for-science-learning-2/)
- A thesis case study on Capacitor Lab: Basics used a parallel DOM to expose every JavaScript-drawn element as HTML to screen readers. Keyboard navigation and descriptions were refined through interviews with screen-reader users. Custom, physical-object-like UI controls are hard to make accessible because they are not native HTML. — [CU Scholar thesis](https://scholar.colorado.edu/downloads/wm117p56k); [Springer chapter](https://link.springer.com/chapter/10.1007/978-3-319-92049-8_28)
- Sonification and alternative input work without assistive technology; interactive description needs a screen reader. — [Accessing Higher Ground](https://accessinghigherground.org/accessible-interactive-simulations-for-science-learning-2/)
- Falstad's voltage encoding is green/red. (Accessibility inference: this is a problematic pair for red-green color-vision deficiency.) — [Falstad directions](https://www.falstad.com/circuit/directions.html)

### Inferences
- Always pair color and height with numbers: node-voltage labels on hover or focus, and a tabular "node list" that also serves screen-reader users as the parallel representation of the schematic and the 3D view.
- Keyboard-operable schematic editing (select node or element, arrow-key value changes) and a text description of topology ("R1 between node 2 and node 3, in series with…").
- Respect prefers-reduced-motion: pause charge animation and fall back to static arrows with magnitude labels. Animation carries no measured learning benefit, so the fallback costs little.
- Mobile: pointer events, large touch targets for terminals and wires, pinch-zoom and pan for the 3D view, and a 2D-only fallback on low-power devices. These are opinion and inference; no evidence found.

### Gaps
- No peer-reviewed learning-outcome studies found for accessible or sonified circuit simulations, and none for circuit simulators on phones or tablets.
