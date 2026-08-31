# M15 chaos soak — what it is, what it found, where it stands

## What this is
`pp-m15.mjs` is a headless **touch-only** bot that plays complete shifts against
injected chaos (legend, code-peep, accident splash, puddles, ice, sample cart)
and asserts the game is beatable *on thumbs*. It drives nothing but the real
widgets — analog thumbstick, look zone, SPRINT/CROUCH/USE — through raw CDP
touch. The keyboard and yaw hooks are wiretapped and must stay at zero calls.

`src/main.ts` is **frozen** since M13. The only diff M15 adds is four probe
lines (`legendSeen` in `state()`, `staffAll()`). Everything else lives in the
bot. If the soak fails, the bug is in the bot.

## How to run
1. Dev server: `npm run dev` (vite on 127.0.0.1:5195).
2. `node pp-m15.mjs 4271,9042,1337` — 3–8 min. Exit 0 = green.
3. `DBG=1 node pp-m15.mjs 4271` — per-tick branch/target/lure lines.
4. `bash run-regression.sh` — the standing 18-suite regression (does **not**
   include pp-m15; see "Why this isn't in the regression" below).

Death traces print automatically for any run that doesn't reach the car:
`| 42.3s f1 (13.67,3.46) q1 P53 l-1 r0 v2.07 | patrol@23.3 alert@4.1`
— time, floor, position, quota, pressure, lure state, relief, speed, and every
guard on the current floor with its state and distance. Diagnose from these,
not from guesses. Speed is the single most informative column: 4.6 is a walk,
7.4 a sprint, 2.07 a crouch, 6.51 a wet sprint, 3.45 a strafe.

## Engine facts — verified against `src/main.ts`, not folklore
The previous version of this brief and most of the bot's original comments had
several of these **backwards**, and each wrong one cost a soak.

**Speeds.** walk 4.6 · sprint 7.4 · crouch 2.07 · patrol 2.6 · alert 3.6 ·
chase 5.2. Wet multiplies the hero by `perkWetSpeed` 0.88 (waived by NAPKINS),
so wet walk 4.05, wet sprint 6.51, wet crouch 1.82.

**Being seen** (`staffStep`, ~line 1404). A patrol spooks when
`heroD < seeRange && staffSeen(s) && (G.wet || v > 5)`, where `seeRange` is 7
standing / 4 crouched; *or*, with no line of sight needed at all, when
`G.wet && heroD < 4.5` (3 crouched). Consequences the bot now relies on:
- **Dry and under sprint speed you are invisible at any range.** Dry crouching
  buys nothing that walking doesn't already buy.
- **Wet is its own trigger, so speed is free once the pants are wet.** A wet
  hero standing still is seen at exactly the radius a wet hero at a dead sprint
  is seen. There is no "sprinting wet is the tell" — that was fiction, and it
  cost the k-log its whole wet phase at a 2.07 crawl.
- `staffSeen` is a **facing cone** (range 13 hall / 11 deck, ~65° half-angle),
  with no wall check. `staffLos` — the real raycast — is consulted only for the
  crouch shed.

**Getting caught** needs `chase` state and `heroD < 1.15`. An **alert** guard
cannot catch you: it homes on your live position at 3.6u/s for 5s and then
reverts to patrol, at which point it re-runs the spook test from wherever it
has arrived. So alert guards are a routing problem, not a fleeing problem.

**Shed.** Crouched + no line of sight for 1.5s → the chaser drops to alert.

**Floors freeze.** `staffStep` early-returns for staff on the other floor, so
crossing a door freezes the entire pursuit. The hall door is a hard reset.

**The ramp is the trap.** The hall door drops you at `(21.2,-13.9)`. Deck guards
**spawn at `(21,-13.9)`** — 0.2u away — and stay frozen there until you first
visit floor 2. 0.2u is inside the 1.15u catch radius, so a **wet** first
crossing is unsurvivable: the spook and the catch land on consecutive frames,
and neither speed nor crouch (wet-crouch still spooks at 3u) changes it. A
**dry, walking** arrival is invisible and strolls past. This is why the bot
banks a dry deck trip early — see the lure below.

**Geometry.** Hall door trigger `(23.2,12.1)` r1.5, reached through a frame gap
only ~1.14u wide. Deck door `(21.2,-13.9)`. Floor-1 toilet `(-22,-14.5)`, deck
toilet `(-16.9,-13.2)`. **The car is seeded** — read `nav().car`, never assume.
The car body is itself a solid.

**Chaos schedule** (`mkSched`, wall-clock): flicker@4, puddle@7, legend@9,
iceburst@12, samplecart@17, puddle@45, codepeep@60; accident @25 for seed 4271
and @45 for 1337, both gated on a quiet hall, 9042 the dry control. Note
`__cap.legend()` **no-ops unless you are on floor 1** — a bot that walks off the
sales floor at t=9 silently deletes the event.

## How the bot works now
The hand-surveyed waypoint chains are gone. They were a per-route patch for the
one route somebody had time to survey by hand, and the shared phase latch
between the exit route and the deck lure was a bug factory.

**Grid path planner.** A 0.25u occupancy grid per floor, inflated by the hero's
own r=0.36 exactly as `collide()` does, with BFS to the target. It runs twice:
first over a grid carrying keep-out discs around the guards, then plain if that
fails, so a guard standing on the last quad can never make it unreachable. The
result is string-pulled to the farthest node in clear line of sight.

**The path wins.** Guard repulsion and obstacle steering apply *only* when the
planner didn't produce a waypoint. Letting them second-guess a real path is
actively harmful — in the 1.14u door gap the two of them shouldered the bot back
out for eight seconds.

**Chase response** is a foot race, not a hiding game: sprint 7.4 (6.51 wet) beats
chase 5.2, so break away along the most-open heading that also points away from
*every* guard, commit to it for 800ms, and keep the shed for genuinely cornered.
When the destination itself ends the run — the hall door, or the car with a full
cart — run for the destination instead of running away.

**The lure** banks the ramp: once the first item is in the cart, walk to the
hall door, cross dry, loiter 4.4u up the east lane until the crew's own patrol
loop carries them 8u off the drop, and come back down. The crossing waits for
t>10.5s so the legend can spawn on floor 1 first; the walk to the door usually
covers that wait.

**Relief** only when the toilet is within 14u. There is deliberately no
desperate clause: the alternative to a 40u trek is an accident, which costs 12%
speed, while the trek costs twenty seconds of walking through the crew twice.

## Where it stands
| | at M15 handoff | now |
|---|---|---|
| soak, typical | 54–56 pass / 4–5 fail | **59–62 pass / 0–1 fail** |
| car exits | 0 of 3, every run | 1–2 per run |
| WET EXIT | never observed | most runs, rank A/B |
| quota | 0–1 on most seeds | 3 on most seeds |
| 18-suite regression | green | green (402 assertions) |

**The soak is not deterministic.** Identical code has scored anywhere from 54 to
62. The chaos schedule fires on wall clock and the bot's decision rate moves
with machine load, so the pass/fail boundary genuinely moves between runs. Judge
changes by repeated soaks, and **never compare a parallel batch against a
sequential baseline** — contention slows the bot's decision loop and makes it
play measurably worse.

## Known open issues
- **Wall-sliding is invisible to the stuck escape.** A bot sliding along a
  solid at 2u/s is "moving" and never trips the stall test, even while
  travelling directly away from its goal. Measuring progress-toward-goal instead
  is the obvious fix and it is **wrong** — tried, measured, reverted (60/54/54
  against 61/61/59): with a planner underneath, a legal detour around a shelf
  closes no distance to the goal for a second or more, so a progress test fires
  on healthy path-following and teleports the bot out of its own route. This
  wants smarter geometry, not a blunter test.
- **Seed 4271 is the hard one.** Only two of its quota items are on floor 1, so
  it must cross to the deck to finish, and its accident lands at ~25s. Most
  remaining losses are 4271 dying with a full cart on the way to the car.

## Why this isn't in the standing regression
`run-regression.sh` stays a deterministic gate. The ~50 per-seed invariants in
this soak (keyboard hooks untouched, no NaN, quota clamped, pressure under the
perk cap, determinism, report lines unique, stick released) would make a fine
gate on their own — none of them need the bot to *win*, only to play. The
handful of outcome assertions (≥1 car exit, WET EXIT, endings vary) don't test
the game at all; they test the bot's skill against a stochastic opponent, and
they are the entire cost and the entire flakiness.

If this ever needs to gate CI, split it three ways: invariants as the fast gate;
game-truths tested directly through the probes, as the wet-escalation ladder now
is; and the full chaos soak nightly over 10–20 seeds reported as a **rate**
("14/20 shifts ended at the car"), not a boolean. Three seeds and a `some()`
cannot honestly support the claim it is currently making.

## Do's / don'ts
- Only touch `pp-m15.mjs`. `src/main.ts` stays frozen — the probe API
  (`state/nav/staffAll/staffPos/teleport/restart/set/setWet/forceEvent`) is
  enough.
- Don't move the chaos schedule to make things pass. The schedule is the spec.
- Keep runs deterministic per seed — the determinism assertion re-runs a seed
  and diffs the report.
- `c.teleport` counts as a "nudge" and exists only for the stuck escape. Every
  other metre must be walked.
