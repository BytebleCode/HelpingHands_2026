// Try the intent model on a demo persona: prints the top guesses for each morning and evening of
// the next 7 days, with the model's reasons. Usage: node scripts/try-intent.js Maya
import { readFileSync } from 'node:fs';
import { core } from '../src/fis/store.js';
import { buildIndex, BLOCKS, WEEKDAYS } from '../src/lib/intentFeatures.js';
import { scoreMoment } from '../src/lib/intentModel.js';
import { todayDay, dayOfWeek } from '../src/lib/dates.js';

const seed = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), 'utf8'));
const model = seed('intent-model.json');
const { identities } = seed('identities.json');
const name = (process.argv[2] || 'Maya').toLowerCase();
const person = identities.find((i) => i.firstName.toLowerCase() === name);
if (!person) {
  console.log(`No persona named "${process.argv[2]}". Try: ${identities.map((i) => i.firstName).join(', ')}`);
  process.exit(1);
}

const index = buildIndex(person.links.map((l) => ({ applCde: l.applCde, txns: core.history(l.instNbr, l.applCde, l.acctNbr) })));
const today = todayDay();
const pct = (p) => `${Math.round(p * 100)}%`.padStart(4);
console.log(`\n${person.firstName} ${person.lastName}: top guesses for the next 7 days\n`);
for (let day = today + 1; day <= today + 7; day++) {
  for (const block of [0, 3]) {
    const [first, second] = scoreMoment(model, index, { day, block });
    const when = `${WEEKDAYS[dayOfWeek(day)].slice(0, 3)} ${BLOCKS[block].key}`.padEnd(14);
    console.log(`${when} ${first.label.padEnd(16)} ${pct(first.probability)}   next: ${second.label} ${pct(second.probability).trim()}`);
    if (first.probability >= 0.15 && first.reasons.length) console.log(`${' '.repeat(15)}why: ${first.reasons.join('; ')}`);
  }
}
const m = model.metrics;
console.log(`\nModel test scores: AUC ${m.auc_model} (frequency only ${m.auc_frequency}), weekly top-3 hit ${Math.round(m.weeklyTop3_model * 100)}% (rule ${Math.round(m.weeklyTop3_rule * 100)}%, chance ${Math.round(m.weeklyTop3_chance * 100)}%)\n`);
