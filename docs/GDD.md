# PRISMA PANIC
### A third-person roguelike about peeing in your pants
Working title. A love letter to the real October 2020 Seinäjoki Prisma incident: a man
peed into his own jeans in the supermarket mirror, then strutted around showing them off
before walking out. (MTV Uutiset, 20.10.2020.)

**Central design principle:** the fact that you *might* pee your pants must create gameplay,
not be the punchline. Bladder pressure is a real resource — like health, ammo, or a closing
clock — that interacts with every other system.

---

## Phase 1 — Research findings (what award-winning indies actually did)

### Steam Awards / major indie winners (2024–2025)
- **2024 GOTY:** Black Myth: Wukong (swept 3 categories). **Most Innovative Gameplay:** Liar's Bar.
  **Outstanding Visual Style:** Silent Hill 2 (distinctive look suffusing the whole game).
- **2025:** GOTY Hollow Knight: Silksong; **Best on Deck: Hades II**; **Better With Friends: PEAK**;
  **Most Innovative Gameplay: ARC Raiders** (nominees: Blue Prince, Escape from Duckov);
  **Outstanding Visual Style: Silent Hill f** (nominees: Dream BBQ, My Little Puppy).
- **Golden Joystick 2024 indies:** Best Indie **Balatro**, self-pub indie **Another Crab's Treasure**,
  Best Early Access **Lethal Company**, Streamers' Choice **Chained Together**, Breakthrough **Balatro**.

### Patterns that actually win
1. **Balatro** — a *simple parlor game* (poker) wrapped in a roguelike. Replayability comes from
   **build crafting** + **information horizon management** (the Blinds system breaks the run into
   bite-sized "just one more" chunks). Its feedback *is* the product: juice/feel was designed as a
   layerable system, not decoration. Lesson: one core tension, layered upgrades, chunked pacing.
2. **Lethal Company / PEAK / Chained Together / R.E.P.O.** — the scavenging loop (hit your quota,
   leave before the timer), fast lethal-but-silly failures, **emergent comedy from the interaction
   of simple systems**, and proximity voice chat. "Human joy maximization" — polish where it counts
   (reaction moments), not graphics. Lesson: quota + closing clock is the proven tension chassis;
   failure must produce *stories*, not just deaths.
3. **Roguelike agency (thom.ee analysis):** players must feel *their choices* drive outcomes.
   **Pre-action luck** (visible choices: "you can see the item, do you risk the trip?") beats
   post-action luck. Skill = instinct + knowledge + strategy. Early picks must still matter at the
   end (Slay the Spire). **Time constraints prevent optimizing the fun out.**
4. **Low-poly art identity:** good low-poly is *commitment*, not a budget apology — flat shading,
   a strict palette, silhouettes with intent, **exaggerated proportions**, consistent density.
   Must read at 231px (thumbnail test). Avoid the generic Synty green look; find a *specific*
   place: a fluorescent-lit Finnish supermarket is ours.
5. **Bodily-humor games** (Roblox obbies, Party Hard, Lethal Company-adjacent): the humor works
   when embarrassment is a **state with mechanical consequences** (you're seen, you're slowed,
   you're judged), not a one-off cutscene. Escalation + audience reaction = the joke engine.
   "A sketch is about recognizable human behavior, not gobbledygook silliness" (Odenkirk).
   Recognizability is why the Prisma video went viral — we build on that recognition.

### Tool access report
Web research worked fine via the built-in `web_search` (one query was served by **Firecrawl**
under the hood) + `web_extract` for the full article. **No additional integrations needed** for
research. If we later need deeper Steam-page scraping (review analysis, price history), a Firecrawl
API key or the `web-data-extraction` skill would help — not required now.

---

## Design decisions

**Engine: Godot 4.7** — already running headless on this box, fully drivable via MCP
(create scenes, run the game, simulate input, screenshots). Perfect fit: lightweight 3D,
CharacterBody3D third-person controller, procedural generation in GDScript, fast iteration,
proven Blender→GLB→Godot pipeline for hero assets.

**Art style: committed flat-shaded low-poly, fluorescent-supermarket palette.**
Concrete gray floor, teal/white cool aisles, one warm accent (the coffee stand red), and
**wet denim = darker, saturated blue** — the single most iconic image of the game (see the
reference still: black top, blue jeans, silver-buckle belt, wet patches on the thighs).
Exaggerated proportions, readable silhouettes, warm fluorescent point-lights against a cool
environment. M1–M3: all code-built primitives (fast). M4: Blender MCP hero model for the
protagonist (cap + jeans + belt, straight from the reference).

**Why the peeing mechanic is a mechanic, not a gag:**
- Pressure is a **visible, audible, escalating resource** (bladder bar, drip ticks, leg knock,
  camera shake, FOV squeeze, waddle). It tells you *how far* you are from an accident at all times.
- It creates a **core distance-vs-pressure tradeoff**: every quota item you want is some distance
  from the nearest toilet, and you know your fill rate. "Do I go?" is the game.
- **Movement costs**: sprinting fills the bladder faster (risk/reward on every axis).
- **Environment fills you**: cold (freezer aisle), caffeine (free coffee samples), panic (later:
  being spotted). The store is a bladder map.
- **Relief has real cost**: toilets are rare, far, and standing there 3+ seconds is vulnerable.
- **Failure transforms instead of ending the run**: an accident → WET PANTS state: slower,
  colder, smelly (NPCs react), but *fearless* (urgency penalty reduced) and +score ("you owned it").
  This is the **embrace-the-embarrassment upside** — the player can choose to lean in, which is
  what turns a gag into a build choice (Balatro-style synergy: Wet Pants + Confident Strut).
- The run ends in **multiple outcomes**: Clean Exit, Wet Exit, Caught at Closing — each with its
  own score and its own *story*.

**Tension & anticipation:** the closing clock (lights-out timer, Lethal Company's exit-shuttle
pattern), procedural toilet placement (you never know the next safe point), escalating sensory
feedback, and random events (coffee lady, ice-machine burst, manager on patrol) that spike
pressure without warning.

**Funny, player-driven moments:** the waddle/squeeze-hop at high urgency; the SPLASH + audience
reaction on an accident; **The Strut** — after an accident you can do the reference video's
mirror strut (hold E at a mirror) for bonus "Dignity" —; grabbing coffee at 85% ("one more, I
swear"); sprinting in the freeze aisle with your knees knocking; fake-shopping (crouching behind
a cereal aisle) to buy seconds.

**What makes each run different:** procedurally assembled store from modular sections
(produce / dairy / frozen / electronics / clothing / stockroom), randomized quota item placement,
random closing time (4–6 min), random event schedule, upgrade choices at restocks (M3), and a
light meta layer: unlockable **pants** (each with a stat profile and a comedy), because the pants
are the character.

**Award-rubric targets:**
- *Most Innovative Gameplay* — pressure-as-resource interlocking with scavenging, stealth-ish
  audience attention, and wardrobe builds.
- *Outstanding Visual Style* — the fluorescent supermarket + wet-denim iconography.
- *Better With Friends* (stretch, post-M5) — proximity voice + co-op quota, the Lethal Company
  lesson: the best moments are the ones you can't control.
- *Memorable* — one image (the wet jeans), one animation (the strut), one sound (the splash),
  one place (the Prisma), a run that ends in a story.

---

## Milestones

| # | Scope | Status |
|---|-------|--------|
| 1 | **Playable peeing mechanic** — 3P controller, bladder meter, urgency states (FRESH→SQUEEZY→PRESSING→CRITICAL), coffee/freezer pressure events, toilet relief (vulnerable 3s action), accident → WET PANTS consequence, quota + closing clock, exit endings, HUD, procedural SFX | **DONE** (M1) |
| 2 | Exploration & movement — real store sections, sprint/crouch movement feel, camera tension feedback, hazards, hiding spots (cereal aisle, fitting room) | **DONE** (M2) |
| 3 | Roguelike systems — procedural store assembly, random events, upgrades at restocks, risk/reward items, difficulty scaling, multiple endings, run summary | **DONE** (M3) |
| 4 | Comedy & personality — NPC reactions (shoppers, coffee lady, manager), The Strut + mirrors, wardrobe with mechanical profiles, physical comedy (squeeze-hop, splash particles), environmental storytelling, rare absurd events (the Prisma incident re-enacts in stockroom) | **DONE** (M4) |
| 5 | Polish — Blender hero model (cap/jeans/belt per reference), lighting pass, sound design pass, juice (screen shake, hit-stop on splash), run summary screen, tutorial moments | **DONE** (M5) |
| 6 | **Pressure interlocks** — sprinting costs bladder (bouncy legs fill faster), panic fill when hunted (staff alert +0.5 / chase +1.3 tiers, the GDD's "panic (being spotted)" pillar), the loop closes: every escape tool is itself pressure | **DONE** (M6a) |
| 7 | **Fake-shopping (crouch/sneak)** — hold C: slow walk, bladder buys seconds (−0.4/s), forward-lean + knee-bend duck animation, real line-of-sight vs shelf geometry (a crouched hero is a cereal aisle), patrol spook range shrinks, break LOS 1.5s behind cover to shed a chase. The counterweight: sprint costs, hiding buys | **DONE** (M6b) |

**Build order discipline:** fun mechanic > playable prototype > game feel > polish > content.
A feature that doesn't make the bladder loop more interesting gets cut.
