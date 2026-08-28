import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
const evalCap = (fn, a1, a2) => page.evaluate(fn, a1, a2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

async function runScenario(name, facts, floors, ending) {
  await evalCap(() => window.__cap.restart(7));
  await sleep(250);
  await evalCap((o, fl) => { window.__cap.facts(o); window.__cap.facts({ floors: new Set(fl) }); }, facts, floors);
  await evalCap((e) => window.__cap.finish(e), ending);
  await sleep(120);
  const rep = await evalCap(() => window.__cap.report());
  return rep;
}
const has = (rep, frag) => rep.lines.some((l) => l.includes(frag));
const notHas = (rep, frag) => !rep.lines.some((l) => l.includes(frag));

// A: CAUGHT, one accident, two spooks
{
  const rep = await runScenario('caught', { wet: true, accidents: 1, spooks: 2, sheds: 0, crouchT: 2, legendSeen: false, struts: 0, quota: 1, quotaTotal: 3, score: 40 }, [1], 'CAUGHT — staff arms themself with body glue and wet-floor signs');
  ok(rep.head, 'A: report header present');
  ok(rep.lines.length >= 4, 'A: report has several lines (got ' + rep.lines.length + ')');
  ok(has(rep, 'code peed'), 'A: caught lead-in');
  ok(has(rep, 'One accident was confirmed'), 'A: single-accident line');
  ok(has(rep, 'security'), 'A: spooks>=2 line');
  ok(notHas(rep, 'buying seconds'), 'A: no crouch line when crouchT<8');
  ok(notHas(rep, '2020 incident'), 'A: no legend line when not seen');
  ok(has(rep, 'The desk gives this shift'), 'A: grade line present');
}

// B: CLEAN + full quota, legend + strut + crouch + both floors
{
  const rep = await runScenario('clean', { wet: false, accidents: 0, spooks: 0, sheds: 1, crouchT: 9, legendSeen: true, struts: 1, quota: 3, quotaTotal: 3, score: 80 }, [1, 2], 'CLEAN EXIT — dry pants, full cart, deck-topping strut. Legend.');
  ok(has(rep, 'completed the entire quota'), 'B: clean+quota lead-in');
  ok(has(rep, 'the jeans stayed dry'), 'B: dry-jeans line');
  ok(has(rep, 'broke line of sight'), 'B: single-shed line');
  ok(has(rep, '2020 incident'), 'B: legend line');
  ok(has(rep, 'strut'), 'B: strut line');
  ok(has(rep, 'buying seconds'), 'B: crouch line');
  ok(has(rep, 'elevators'), 'B: both-floors line');
}

// C: D rank grade
{
  const rep = await runScenario('drank', { wet: true, accidents: 0, spooks: 0, sheds: 0, crouchT: 0, legendSeen: false, struts: 0, quota: 0, quotaTotal: 3, score: 10 }, [1], 'CAUGHT — body glue');
  ok(has(rep, 'gives this shift a D'), 'C: D rank grade');
}

// D: S rank grade
{
  const rep = await runScenario('srank', { wet: false, accidents: 0, spooks: 0, sheds: 0, crouchT: 0, legendSeen: false, struts: 0, quota: 3, quotaTotal: 3, score: 100 }, [1], 'CLEAN EXIT — legend');
  ok(has(rep, 'gives this shift an S'), 'D: S rank grade');
}

// E: STORE CLOSED lead-in
{
  const rep = await runScenario('closed', { wet: true, accidents: 1, spooks: 1, sheds: 0, crouchT: 0, legendSeen: false, struts: 1, quota: 2, quotaTotal: 3, score: 30 }, [1], 'STORE CLOSED — the lights died mid-strut. Security found you at the deli counter.');
  ok(has(rep, 'lights went out mid-strut'), 'E: closed lead-in');
  ok(has(rep, 'asked "why is this man sprinting?"'), 'E: single-spook folklore line');
}

console.log(`${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
