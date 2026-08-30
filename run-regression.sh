#!/bin/bash
# Full probe regression: every pp-* suite, result line per suite.
cd "$(dirname "$0")"
for t in pp-test pp-m3 pp-m4 pp-m5 pp-m5b pp-m5c pp-m5d pp-m6 pp-m6b pp-m7 pp-m8 pp-m9 pp-m10 pp-m11 pp-m12 pp-m13 pp-cam pp-hero; do
  timeout 900 node "$t.mjs" > "/tmp/reg-$t.log" 2>&1
  code=$?
  res=$(grep -oE '[0-9]+ pass / [0-9]+ fail' "/tmp/reg-$t.log" | tail -1)
  echo "$t exit:$code ${res:-no-summary}"
done
echo ALL_DONE
