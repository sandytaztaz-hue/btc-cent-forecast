// btc-cent-forecast-01: forecast Bitcoin's price 240 minutes after each checkpoint.
//
// Score is mean absolute error in cents, so the best single guess is the honest
// conditional median of the price 4 hours out. The forecast is the last close
// shifted by two measured structures in the price history, pulling opposite ways:
//
//   (1) a slow drift: the 72-hour OLS trend of log-price, shrunk toward zero —
//       the practice window trends down (mean 240-min log return -0.152%), so the
//       trend term carries real signal;
//   (2) a short-horizon reversal: the last 4 hours' move tends to reverse
//       (lag-240 autocorrelation of non-overlapping 240-min returns is -0.376),
//       so a fraction of the last 4h log move is subtracted back.
//
//   forecast = last * exp(240 * TREND_SHRINKAGE * slope - REVERSAL_COEF * r4h)
//
// where `slope` is the OLS slope of log-price on time over all 4,320 closes and
// `r4h = ln(last / close 240 minutes ago)`. Either term alone fails a cross-check
// (pure trend loses on pseudo-cases; pure reversal wins on pseudo but loses on the
// real practice cases); combined, all 9 neighbouring parameter settings beat
// persistence on both sets — a flat plateau, not a tuned spike. Backtest on the
// kit's practice data: 36,598 cents MAE on 360 in-file pseudo-cases vs 37,690
// for persistence (+2.90%), and 44,398 cents on the 5 real practice cases with
// known actuals vs 47,055 for persistence (+5.65%).
//
// Node 22, standard library only, no network. Reads every <id>.in in the input
// directory and writes one <id>.out per case:
//   {"forecasts":[{"case":"<the case's id>","price":<number>}]}
// Runs are deterministic: two runs write identical bytes.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand
// in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Horizon of the forecast, in minutes (fixed by the competition). */
const HORIZON_MIN = 240;

/**
 * Calibrated by backtest (see README.md):
 * - TREND_SHRINKAGE: the 72h OLS trend slope is shrunk this far toward zero.
 * - REVERSAL_COEF: this fraction of the last 4h log move is subtracted back.
 * The pair (0.75, 0.25) sits in the middle of a flat plateau: all 9 neighbours
 * (trend 0.5-0.75 x reversal 0.2-0.3) beat persistence on both the pseudo-case
 * set and the real practice cases.
 */
const TREND_SHRINKAGE = 0.75;
const REVERSAL_COEF = 0.25;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/**
 * Forecast one market's price HORIZON_MIN minutes after its last close.
 * Median forecast = last close * exp(240 * TREND_SHRINKAGE * slope
 *                                      - REVERSAL_COEF * r4h),
 * where `slope` is the OLS slope of log-price on time over the whole case and
 * `r4h` is the log move of the last 240 minutes.
 */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const prices = m.prices;
  const last = prices[prices.length - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) {
    throw new Error(`market ${m.id}'s last price is not a positive finite number`);
  }
  const n = prices.length;
  if (n < HORIZON_MIN + 2) return price5(last); // too little history: persistence is the honest median.

  // Single pass: OLS slope of log-price on the minute index, plus validation.
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const p = prices[i] as number;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) {
      throw new Error(`market ${m.id} has a bad price at index ${i}`);
    }
    const y = Math.log(p);
    sumX += i;
    sumY += y;
    sumXX += i * i;
    sumXY += i * y;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const r4h = Math.log(last / (prices[n - 1 - HORIZON_MIN] as number));
  const logShift = HORIZON_MIN * TREND_SHRINKAGE * slope - REVERSAL_COEF * r4h;
  return price5(last * Math.exp(logShift));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
