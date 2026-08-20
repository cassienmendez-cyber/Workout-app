import { chromium } from 'playwright';
const SHOTS = '/tmp/claude-0/-home-user-Workout-app/106cfa42-715f-54f3-8055-5e124a124a67/scratchpad/shots';
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});

await page.goto('http://127.0.0.1:4173/');
await page.evaluate(() => localStorage.clear());
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

await page.locator('.choice', { hasText: 'Muscle gain' }).first().click();
await page.getByRole('button', { name: 'Continue' }).click();
const days = page.locator('.chip-row').nth(1).locator('.chip');
for (let i = 0; i < (await days.count()); i++) {
  const c = days.nth(i);
  if ((await c.getAttribute('aria-pressed')) === 'false') await c.click();
}
await page.getByRole('button', { name: 'Continue' }).click();
await page.locator('.choice', { hasText: '45 minutes' }).first().click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.locator('.choice', { hasText: 'Intermediate' }).first().click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Build my program' }).click();
await page.waitForTimeout(500);

// Seed yesterday's session as a copy of today's exercises at a modest load,
// so today's heavier session produces a genuine PR against a real previous best.
const seeded = await page.evaluate(() => {
  const KEY = 'adaptive-strength.state.v1';
  const st = JSON.parse(localStorage.getItem(KEY));
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = iso(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);

  const todays = st.workouts.find((w) => (w.actualDate ?? w.plannedDate) === today);
  if (!todays) return null;

  const past = structuredClone(todays);
  past.id = 'seed_prev';
  past.plannedDate = iso(y);
  past.actualDate = iso(y);
  past.status = 'completed';
  past.completedAt = `${iso(y)}T12:00:00.000Z`;
  past.durationSeconds = 2400;
  past.exercises = past.exercises.map((we, i) => ({
    ...we,
    id: `seed_prev_${i}`,
    feedback: { difficulty: 'just_right' },
    sets: we.sets.map((s, si) => ({
      ...s,
      id: `seed_prev_${i}_${si}`,
      actualLoad: 100,
      actualReps: we.targetRepRange.min,
      completed: true,
      timestamp: `${iso(y)}T12:00:00.000Z`,
    })),
  }));

  st.workouts = [past, ...st.workouts];
  localStorage.setItem(KEY, JSON.stringify(st));
  return { exercises: past.exercises.length };
});
console.log('seeded previous session:', seeded);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await page.getByRole('button', { name: /Start workout|Resume workout/ }).first().click();
await page.waitForTimeout(300);
if ((await page.locator('.screen-title').first().textContent()) === 'How are you feeling?') {
  await page.locator('.choice', { hasText: 'Normal' }).first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.waitForTimeout(400);
}

// Log everything noticeably heavier than the seeded 100.
for (let e = 0; e < 8; e++) {
  const rows = page.locator('.set-row');
  const rn = await rows.count();
  for (let i = 0; i < rn; i++) {
    const row = rows.nth(i);
    await row.locator('input').first().fill('160');
    const chk = row.locator('.set-check');
    if ((await chk.getAttribute('aria-pressed')) === 'false') await chk.click();
    await page.waitForTimeout(50);
  }
  const finish = page.getByRole('button', { name: 'Finish workout' });
  const next = page.getByRole('button', { name: 'Next exercise' });
  const btn = (await finish.count()) > 0 ? finish : next;
  await btn.click();
  await page.waitForTimeout(300);
  if ((await page.locator('.sheet-title').count()) > 0) {
    await page.locator('.choice', { hasText: 'Just right' }).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(250);
    await btn.click();
    await page.waitForTimeout(300);
  }
  if ((await page.locator('.screen-title').first().textContent().catch(() => '')) === 'Ready to submit?')
    break;
}

await page.getByRole('button', { name: 'Submit as completed' }).first().click();
await page.waitForTimeout(300);
await page.locator('.sheet').getByRole('button', { name: 'Submit as completed' }).click();
await page.waitForTimeout(800);

const stages = [];
for (let i = 0; i < 4; i++) {
  const h = await page.locator('.celebrate h1').first().textContent().catch(() => null);
  if (!h) break;
  stages.push(h);
  await page.screenshot({ path: `${SHOTS}/40-celebrate-${i}.png` });
  if (/record/i.test(h)) {
    const cmp = await page.locator('.pr-compare').first().textContent();
    console.log('PR card:', cmp.replace(/\s+/g, ' ').trim());
  }
  const b = page.getByRole('button', { name: /^(Done|Next)$/ });
  if ((await b.count()) === 0) break;
  await b.first().click();
  await page.waitForTimeout(500);
}
console.log('stages:', stages);

// The next scheduled session should now carry the new load forward.
const next = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('adaptive-strength.state.v1'));
  const upcoming = st.workouts
    .filter((w) => w.status === 'scheduled')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate))[0];
  return upcoming
    ? { label: upcoming.slotLabel, loads: upcoming.exercises.map((e) => e.targetLoad), notes: upcoming.adaptations }
    : null;
});
console.log('\nnext session:', next?.label, '| target loads:', next?.loads);
console.log('adaptation notes:');
(next?.notes ?? []).forEach((n) => console.log('  -', n));

await browser.close();
console.log('\nerrors:', errors.length ? errors : 'none');
