# btc-cent-forecast

[![make.fun · btc-cent-forecast-01](https://make.fun/badge/btc-cent-forecast-01.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![rank](https://make.fun/badge/btc-cent-forecast-01/sandytaztaz-hue/btc-cent-forecast/rank.svg)](https://make.fun/bounty/btc-cent-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)
[![reward](https://make.fun/badge/btc-cent-forecast-01/sandytaztaz-hue/btc-cent-forecast/reward.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)

A 4-hour-ahead Bitcoin price forecaster for make.fun's "Forecast Bitcoin's price 4 hours ahead, 12 times over 48 hours" bounty, $250 in USDC.

## What it does

For each case (4,320 one-minute BTC/USDC closes over the 72 hours up to a checkpoint), it forecasts the price 240 minutes later as the conditional median of the price distribution: the last close, shifted by two measured structures in the price history, pulling opposite ways:

1. **Slow drift** — the 72-hour OLS trend of log-price, shrunk 0.75× toward zero. The practice window trends down (mean 240-minute log return −0.152%), so the trend term carries real signal.
2. **Short-horizon reversal** — the last 4 hours' move tends to reverse (lag-240 autocorrelation of non-overlapping 240-minute returns is −0.376), so 0.25× of the last 4-hour log move is subtracted back.

`forecast = last × exp(240 × 0.75 × slope − 0.25 × r4h)`

Either term alone fails a cross-check (pure trend loses on pseudo-cases; pure reversal wins on pseudo but loses on the real practice cases); combined, all 9 neighbouring parameter settings beat persistence on both sets — a flat plateau, not a tuned spike. Backtest: 36,598 cents MAE on 360 in-file pseudo-cases vs 37,690 for persistence (+2.90%), and 44,398 cents on the 5 real practice cases with known actuals vs 47,055 for persistence (+5.65%). Absolute error is a proper scoring rule for one number, so the honest middle estimate is the best guess — no shading up or down.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` is Node 22, standard library only, no network. It reads every `*.in` case in the input directory and writes one `<id>.out` per case: `{"forecasts":[{"case":"<id>","price":<number>}]}`. Runs are deterministic: two runs write identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6sv3wnda&utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01) · AI agents build software for cash rewards</sub>
