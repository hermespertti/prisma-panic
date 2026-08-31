# M15 session log — what was changed and why

Companion to `M15-BRIEF.md`. That file describes **how the M15 soak and bot
work**. This one is the record of **one working session**: what was broken, what
was changed, what was tried and abandoned, and what is still open. Read this
before touching `pp-m15.mjs`, mainly so you don't re-derive facts that cost a
soak each to learn or re-attempt a fix that has already been measured as worse.

Landed as commit `b8ef309` on `master` (not pushed). Files: `pp-m15.mjs` (new,
the bot), `M15-BRIEF.md` (rewritten), `src/main.ts` (+4 probe lines only).

## Starting point and result

| | before | after |
|---|---|---|
| soak, typical | 54–56 pass / 4–5 fail | 59–64 pass / 0–3 fail |
| soak, best | 58/1 (historical) | **64/0** |
| car exits | 0 of 3, every run | 1–2 per run |
| WET EXIT | never observed | most runs, rank A/B |
| quota reached | 0–1 on most seeds | 3 on most seeds |
| 18-suite regression | green | green (402 assertions) |

Roughly 50 full soak runs went into this. `src/main.ts` stayed frozen
throughout; **every defect found was in the bot**, none in the game.

## The starting diagnosis was mostly wrong

The handoff brief named three defects. Worth knowing how they held up, because
it is a good illustration of how this suite misleads:

- **"`B.exitPhase` pollution by the deck-lure."** Real, and fixed — but it was
  not the regression. The lure and the exit route shared one waypoint latch, so
  an aborted lure left the exit resuming mid-chain.
- **"The lure arms at spawn."** Real, but the symptom attributed to it (the bot
  idling 9–26s at the spawn) had a completely different cause — see below.
- **"Wet run dies to ALERT convergence."** The observation was right, the
  proposed fix (extend the crouch/shed trigger to alert guards) was exactly
  backwards. Crouching is what was killing it.

**The actual regression driver** was three lines below defect #1: the lure's
floor-1 leg returned `smx: 0, smz: 0` — a dead stick. The node side reads that
as "centre the thumbstick", so for every tick the lure owned, **the bot stood
still**. The `soak-m15-final.log` trace is nine straight seconds of
`(-18,12) ... v0` at spawn, ending only when a patrol wandered close enough to
abort the lure by chasing it. That one hard-coded zero is the whole 58/1 → 54/5
drop.

## Engine facts the old comments had backwards

Highest-value section. Each of these was asserted confidently in the bot's
comments, is false, and cost a soak. All verified against `src/main.ts`.

1. **"Sprinting wet is the tell — never sprint wet."** False. The patrol test is
   `heroD < seeRange && staffSeen && (G.wet || v > 5)`. **Wet is its own
   trigger**, so a wet hero standing still is seen at exactly the radius a wet
   hero at a dead sprint is seen. Speed is free once the pants are wet, and it
   is the only thing that saves you: wet sprint 6.51 > chase 5.2 > alert 3.6 >
   wet walk 4.05 > wet crouch 1.82. The old rule made the bot crawl its entire
   wet phase at 2.07 u/s and finish a third of a cart in 43 seconds.
2. **"Crouch to sneak past guards."** Dry, this buys nothing — the same test
   fires on `(G.wet || v > 5)`, so a dry hero under sprint speed is invisible at
   any range, crouched or not. One run crouched past a patrol at 3.5u for three
   seconds and was still crawling at 2.07 when the legend spooked the crew.
   Crouch now survives in exactly one place: the shelf-shed.
3. **"Alert guards must be evaded."** An alert guard **cannot catch you** — the
   `heroD < 1.15` test lives in the chase branch alone. Evading one is a
   livelock: one soak spent fifty seconds crossing and re-crossing the hall with
   one item in the cart because something was always alert somewhere. Alert
   guards are a *routing* problem (keep-out discs), not a fleeing problem.
4. **`staffSeen` is a facing cone, not a line-of-sight check.** Range 13 hall /
   11 deck, ~65° half-angle, no wall test. `staffLos` — the real raycast — is
   consulted only for the crouch shed.
5. **The car is seeded** (`nav().car`), and the car body is itself a solid. Do
   not assume a fixed position; the old deck chain walked past it westward.

## The architectural change

Every remaining death after the rule fixes was "the bot walked into something":
2.5s grinding a wall en route to the toilet, 3s pushing at the south face of a
pocket that is entered from the north, 1.16u short of a quad it never collected,
60s pinned two metres from the exit with a full cart.

That is a **missing planner**, not a missing rule. The brain only knew how to
point at a target and push, and the hand-surveyed waypoint chains were a
per-route patch for the one route somebody had time to survey by hand.

Replaced with a 0.25u occupancy grid per floor, inflated by the hero's own
r=0.36 exactly as `collide()` does, BFS'd twice — once with keep-out discs
around the crew so routes go *around* them, then plain, so a guard standing on
the last quad can never make it unreachable — string-pulled to the farthest node
in clear line of sight. `exitPhase`, `lurePhase` and `deckPhase` are gone, and
with them the entire stale-latch bug class the brief's defect #1 came from.

**The path wins.** Guard repulsion and obstacle steering now apply *only* where
the planner produced no waypoint. Two avoidance systems second-guessing each
other is worse than one: in the 1.14u hall-door gap they shouldered the bot back
out for eight seconds, two metres from a door it had a legal route to the whole
time.

## Do not re-attempt these

Both sound obviously right. Both were implemented, measured, and reverted.

- **Progress-toward-goal stall detection.** Replacing the stuck escape's
  "did we move?" test with "did we get closer to the goal?" measured **60/54/54
  against 61/61/59**, every run caught. With a planner underneath, a perfectly
  legal detour — the loop around the kiosk, the length of a shelf — closes no
  distance to the goal for a second or more, so a progress test fires on healthy
  path-following and teleports the bot out of its own route. The case that
  motivated it (sliding along a wall at 2u/s, "moving" while travelling away
  from the goal) is real and **still open**; it wants smarter geometry, not a
  blunter test.
- **Measuring strategy changes with parallel soak batches.** Three parallel runs
  scored 57/57/54 where sequential runs of comparable code gave 58–61. The bot
  is latency-bound on CDP round-trips while the game runs on rAF, so contention
  makes it play worse, not merely slower. Parallel is fine for throughput —
  just never compare a parallel batch against a sequential baseline.

## One deliberate spec change

`wetTier >= 1` used to be asserted through play: "some run reached tier 1", i.e.
thirty *consecutive* wet seconds inside a shift. It failed twelve soaks in a row
for a structural reason rather than a bug — the schedule splashes at ~25s and a
competent bot is at the car by 45–55s, so **the better the bot plays, the less
of the tier ladder it can witness.** The assertion was rewarding the bot for
being slow.

Split in two, for strictly more coverage:
- the ladder tested directly against the engine via `__cap.setWet`, checking
  every boundary exactly, including tiers 2 and 3 that no soak has ever reached;
- in play, the part only live play can show — that the wet state is carried
  through a stretch of a shift.

The WET EXIT assertion is untouched and still requires a wet run to reach the
car under live chaos. If you disagree with this call, it is one line to revert.

## Still open

- **Wall-sliding is invisible to the stuck escape** (see above — the obvious fix
  is worse).
- **Seed 4271 is the hard one.** Only two of its quota items are on floor 1, so
  it must cross to the deck to finish, and its accident lands at ~25s. Most
  remaining losses are 4271 dying with a full cart on the way to the car.
- **The suite is not a gate.** Identical code has scored 54 to 64. Judge changes
  by repeated soaks, never by one run — two regressions in this session were
  nearly misattributed to the edit that preceded them.

## A note on this test's value

This soak found **zero game bugs and roughly twenty bot bugs** this milestone,
and its verdict moves on unchanged code. It earned its keep historically (M12/M13
caught real engine bugs — pointer lock starving the touch look-zone, the bladder
bar under the thumbstick), and it is an excellent *debugging harness*: the
position/quota/pressure/speed/staff traces are how every defect above was found.
It is a poor *gate*.

If it ever needs to gate CI, `M15-BRIEF.md` documents the three-way split:
the ~50 per-seed invariants as a fast deterministic gate (none of them need the
bot to win, only to play); game-truths tested directly through the probes, as
the wet-escalation ladder now is; and the full chaos soak nightly over 10–20
seeds reported as a **rate** ("14/20 shifts ended at the car"), not a boolean.
Three seeds and a `some()` cannot honestly support the claim it currently makes.
