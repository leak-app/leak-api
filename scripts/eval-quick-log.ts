/**
 * Scores quick-log parsing on test/fixtures/quick-log-cases.json: layer 1 alone,
 * then layer 1 + Gemini through the same code the API runs (`resolveQuickLog`).
 *
 *   node --env-file=.env -r ts-node/register scripts/eval-quick-log.ts
 *
 * Needs GEMINI_API_KEY and GEMINI_MODEL. The fixture holds made-up phrases only;
 * real user phrases must go through a paid-tier key, never an unpaid one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CallLimiter } from '../src/modules/quick-log/call-limiter';
import {
  GeminiClient,
  type GeminiUsage,
} from '../src/common/gemini/gemini.client';
import { GeminiParser } from '../src/modules/quick-log/gemini.parser';
import { parseQuickLog } from '../src/modules/quick-log/quick-log.parser';
import { resolveQuickLog } from '../src/modules/quick-log/quick-log.resolve';
import type {
  QuickLogContext,
  QuickLogDraft,
} from '../src/modules/quick-log/quick-log.types';

interface Case {
  text: string;
  expectedAmount: number;
  expectedType: 'EXPENSE' | 'INCOME';
  expectedCategory: string;
  tags: string[];
}
interface Fixture {
  categories: QuickLogContext['categories'];
  wallets: QuickLogContext['wallets'];
  cases: Case[];
}

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
if (!apiKey || !model) {
  console.error('GEMINI_API_KEY and GEMINI_MODEL must be set in api/.env');
  process.exit(1);
}
const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 3000);

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../test/fixtures/quick-log-cases.json'),
    'utf8',
  ),
) as Fixture;
const ctx: QuickLogContext = {
  categories: fixture.categories,
  wallets: fixture.wallets,
};
const nameOf = (id: string | null) =>
  fixture.categories.find((c) => c.id === id)?.name ?? null;

const usage: GeminiUsage[] = [];
const latencies: number[] = [];
let geminiCalls = 0;
let geminiNulls = 0;
const parser = new GeminiParser(
  new GeminiClient(apiKey, model, timeoutMs, (u) => usage.push(u)),
  new CallLimiter(10_000, 60_000),
);
// The free tier allows 15 requests a minute per model; GEMINI_EVAL_PACE_MS=4500
// stays under it. Waiting happens before the timer starts, so it is not latency.
const paceMs = Number(process.env.GEMINI_EVAL_PACE_MS ?? 0);
let lastCallAt = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const timedGemini = {
  async parse(
    ...args: Parameters<GeminiParser['parse']>
  ): ReturnType<GeminiParser['parse']> {
    const wait = lastCallAt + paceMs - Date.now();
    if (wait > 0) await sleep(wait);
    const started = Date.now();
    const result = await parser.parse(...args);
    lastCallAt = Date.now();
    latencies.push(Date.now() - started);
    geminiCalls += 1;
    if (!result) geminiNulls += 1;
    return result;
  },
};

const pct = (n: number, d: number) =>
  d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}% (${n}/${d})`;
const percentile = (xs: number[], p: number) => {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};

interface Row {
  c: Case;
  l1: QuickLogDraft;
  final: QuickLogDraft;
}

async function main() {
  const rows: Row[] = [];
  for (const c of fixture.cases) {
    const l1 = parseQuickLog(c.text, ctx);
    const final = await resolveQuickLog('eval', c.text, ctx, timedGemini);
    rows.push({ c, l1, final });
  }

  const catOk = (d: QuickLogDraft, c: Case) =>
    nameOf(d.categoryId) === c.expectedCategory;
  const catWrong = (d: QuickLogDraft, c: Case) =>
    d.categoryId !== null && !catOk(d, c);
  const open = rows.filter((r) => r.l1.unresolved.includes('category'));
  const spoken = rows.filter((r) => r.c.tags.includes('spoken'));
  const hard = rows.filter((r) => r.c.tags.includes('no-keyword'));
  const income = rows.filter((r) => r.c.tags.includes('income'));
  const n = rows.length;
  const count = (rs: Row[], f: (r: Row) => boolean) => rs.filter(f).length;

  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  out(`pace: ${paceMs} ms between Gemini calls`);
  out(`model: ${model}   cases: ${n}   timeout: ${timeoutMs} ms`);
  out();
  out('| Measure | Layer 1 | Layer 1 + Gemini |');
  out('| :--- | :--- | :--- |');
  const row = (
    label: string,
    rs: Row[],
    f: (d: QuickLogDraft, c: Case) => boolean,
  ) =>
    out(
      `| ${label} | ${pct(
        count(rs, (r) => f(r.l1, r.c)),
        rs.length,
      )} | ${pct(
        count(rs, (r) => f(r.final, r.c)),
        rs.length,
      )} |`,
    );
  row('Category correct, all', rows, catOk);
  row('Category wrong (not blank), all', rows, catWrong);
  row('Category correct, cases layer 1 left open', open, catOk);
  row('Category correct, no-keyword cases', hard, catOk);
  row('Category correct, income cases', income, catOk);
  row('Amount correct, all', rows, (d, c) => d.amount === c.expectedAmount);
  row(
    'Amount correct, spoken/slang amounts',
    spoken,
    (d, c) => d.amount === c.expectedAmount,
  );
  row(
    'Amount wrong (not blank), all',
    rows,
    (d, c) => d.amount !== null && d.amount !== c.expectedAmount,
  );
  row('Type correct, all', rows, (d, c) => d.type === c.expectedType);
  row(
    'Fully correct (amount, type, category)',
    rows,
    (d, c) =>
      d.amount === c.expectedAmount && d.type === c.expectedType && catOk(d, c),
  );
  out();

  const promptTokens = usage.reduce((s, u) => s + u.promptTokens, 0);
  const outputTokens = usage.reduce((s, u) => s + u.outputTokens, 0);
  const thoughtTokens = usage.reduce((s, u) => s + u.thoughtTokens, 0);
  out(`Cases layer 1 left open (category): ${open.length} of ${n}`);
  out(
    `Gemini calls: ${geminiCalls} of ${n} (${geminiNulls} returned nothing: timeout, error or bad output)`,
  );
  out(
    `Latency p50 ${percentile(latencies, 0.5)} ms, p95 ${percentile(latencies, 0.95)} ms, max ${Math.max(...latencies)} ms`,
  );
  out(
    `Tokens: prompt ${promptTokens}, output ${outputTokens}, thought ${thoughtTokens} (per call: ${(promptTokens / Math.max(usage.length, 1)).toFixed(0)} in, ${(outputTokens / Math.max(usage.length, 1)).toFixed(0)} out)`,
  );
  out(
    `Tokens per 1,000 parses at this call rate: ${((promptTokens / n) * 1000).toFixed(0)} in, ${((outputTokens / n) * 1000).toFixed(0)} out`,
  );
  out();

  const gain =
    (100 * count(open, (r) => catOk(r.final, r.c))) / Math.max(open.length, 1) -
    (100 * count(open, (r) => catOk(r.l1, r.c))) / Math.max(open.length, 1);
  out(
    `Gate: category gain on open cases ${gain.toFixed(1)} points (need >= 10); p95 ${percentile(latencies, 0.95)} ms (need <= 3000)`,
  );
  out();

  out('Still wrong or blank after layer 2:');
  for (const r of rows) {
    const issues: string[] = [];
    if (!catOk(r.final, r.c))
      issues.push(
        `category ${nameOf(r.final.categoryId) ?? '(blank)'} != ${r.c.expectedCategory}`,
      );
    if (r.final.amount !== r.c.expectedAmount)
      issues.push(
        `amount ${r.final.amount ?? '(blank)'} != ${r.c.expectedAmount}`,
      );
    if (r.final.type !== r.c.expectedType)
      issues.push(`type ${r.final.type} != ${r.c.expectedType}`);
    if (issues.length) out(`- "${r.c.text}": ${issues.join('; ')}`);
  }
  console.log(lines.join('\n'));
}

void main();
