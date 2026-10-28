// Write content/ece201/bench.json: the book exercises drawn on the Circuit Bench
// (app/static/circuits/selftest/book.js), which their problem pages open. Rerun it after
// changing a drawing; tests/js/book.test.mjs fails until you do.
//   node scripts/export_bench_book.mjs
import { writeFileSync } from "node:fs";

import { bookJSON } from "../app/static/circuits/selftest/book.js";

const out = new URL("../content/ece201/bench.json", import.meta.url);
const data = bookJSON();
writeFileSync(out, JSON.stringify(data, null, 1) + "\n");
console.log(`wrote ${Object.keys(data.circuits).length} circuits to content/ece201/bench.json`);
