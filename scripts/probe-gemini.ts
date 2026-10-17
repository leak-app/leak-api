/**
 * Throwaway probe for the quick-log Gemini fallback: sends 12 made-up phrases
 * through the real request builder and prints accuracy and latency per model.
 * No real user data is used, so any key tier works. Never prints the key.
 *
 *   yarn ts-node scripts/probe-gemini.ts
 *   GEMINI_PROBE_MODELS=model-a,model-b yarn ts-node scripts/probe-gemini.ts
 */
import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  NO_CATEGORY,
  buildGeminiRequest,
} from '../src/modules/quick-log/gemini.request';

const CATEGORIES = [
  'Ăn uống',
  'Di chuyển',
  'Mua sắm',
  'Hóa đơn',
  'Giải trí',
  'Sức khỏe',
];

interface Case {
  text: string;
  amount: number;
  category: string | null; // null = income, no expense category expected
  type: 'expense' | 'income';
}

const CASES: Case[] = [
  { text: '55k phở bò', amount: 55_000, category: 'Ăn uống', type: 'expense' },
  { text: 'Grab 42k', amount: 42_000, category: 'Di chuyển', type: 'expense' },
  {
    text: 'mua áo 200k',
    amount: 200_000,
    category: 'Mua sắm',
    type: 'expense',
  },
  {
    text: 'đổ xăng 80k',
    amount: 80_000,
    category: 'Di chuyển',
    type: 'expense',
  },
  {
    text: 'tiền điện 1tr2',
    amount: 1_200_000,
    category: 'Hóa đơn',
    type: 'expense',
  },
  {
    text: 'xem phim 120k',
    amount: 120_000,
    category: 'Giải trí',
    type: 'expense',
  },
  { text: 'cà phê 35k', amount: 35_000, category: 'Ăn uống', type: 'expense' },
  {
    text: 'mua thuốc 90k',
    amount: 90_000,
    category: 'Sức khỏe',
    type: 'expense',
  },
  {
    text: 'netflix 260k',
    amount: 260_000,
    category: 'Giải trí',
    type: 'expense',
  },
  {
    text: 'hai lăm nghìn xe ôm',
    amount: 25_000,
    category: 'Di chuyển',
    type: 'expense',
  },
  {
    text: 'năm chục nghìn cơm trưa',
    amount: 50_000,
    category: 'Ăn uống',
    type: 'expense',
  },
  {
    text: 'lương tháng 10 15tr',
    amount: 15_000_000,
    category: null,
    type: 'income',
  },
];

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in api/.env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });
// MINIMAL | LOW | MEDIUM | HIGH. Defaults to MINIMAL: the task is trivial
// and thinking tokens only add latency.
const THINKING = (process.env.GEMINI_PROBE_THINKING ??
  'MINIMAL') as keyof typeof ThinkingLevel;
const models = (
  process.env.GEMINI_PROBE_MODELS ??
  'gemini-3.5-flash-lite,gemini-3.1-flash-lite'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

async function ask(model: string, text: string) {
  const req = buildGeminiRequest(text, CATEGORIES);
  const started = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: req.user,
    config: {
      systemInstruction: req.system,
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: req.schema,
      abortSignal: AbortSignal.timeout(15_000),
      ...(THINKING
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel[THINKING] } }
        : {}),
    },
  });
  return {
    ms: Date.now() - started,
    json: JSON.parse(response.text ?? 'null') as {
      amount: number | null;
      type: string;
      category: string;
    } | null,
    tokens: response.usageMetadata,
  };
}

async function main() {
  for (const model of models) {
    console.log(`\n== ${model}`);
    let categoryOk = 0;
    let amountOk = 0;
    let typeOk = 0;
    const times: number[] = [];
    let promptTokens = 0;
    let outputTokens = 0;
    let thoughtTokens = 0;
    for (const c of CASES) {
      try {
        const { ms, json, tokens } = await ask(model, c.text);
        times.push(ms);
        promptTokens += tokens?.promptTokenCount ?? 0;
        outputTokens += tokens?.candidatesTokenCount ?? 0;
        thoughtTokens += tokens?.thoughtsTokenCount ?? 0;
        const gotCategory =
          json?.category === NO_CATEGORY ? null : json?.category;
        const catHit = c.category === null ? true : gotCategory === c.category;
        const amtHit = json?.amount === c.amount;
        const typeHit = json?.type === c.type;
        categoryOk += catHit ? 1 : 0;
        amountOk += amtHit ? 1 : 0;
        typeOk += typeHit ? 1 : 0;
        console.log(
          `${c.text.padEnd(26)} cat=${catHit ? 'OK ' : 'BAD'} ${String(json?.category).padEnd(10)} amt=${amtHit ? 'OK ' : 'BAD'} ${String(json?.amount).padEnd(9)} type=${json?.type} ${ms}ms`,
        );
      } catch (error) {
        console.log(
          `${c.text.padEnd(26)} ERROR ${(error as Error).message.slice(0, 160)}`,
        );
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    console.log(
      `category ${categoryOk}/${CASES.length}  amount ${amountOk}/${CASES.length}  type ${typeOk}/${CASES.length}  median ${median}ms  max ${times[times.length - 1]}ms  tokens in/out/thought ${promptTokens}/${outputTokens}/${thoughtTokens}`,
    );
  }
}

void main();
