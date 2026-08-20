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
await page.locator('.chip', { hasText: /^3$/ }).first().click();
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

// --- 1. Load guard: completing a loaded set with no weight must be refused.
await page.getByRole('button', { name: 'Start workout' }).first().click();
await page.waitForTimeout(300);
await page.locator('.choice', { hasText: 'Normal' }).first().click();
await page.getByRole('button', { name: 'Start workout' }).click();
await page.waitForTimeout(400);

const firstRow = page.locator('.set-row').first();
await firstRow.locator('.set-check').click();
await page.waitForTimeout(300);
const guarded = (await firstRow.locator('.set-check').getAttribute('aria-pressed')) === 'false';
const warned = (await page.locator('.note--warning').count()) > 0;
console.log('load guard blocks empty-weight completion:', guarded);
console.log('load guard shows an explanation:', warned);
await page.screenshot({ path: `${SHOTS}/30-load-guard.png` });

// Now enter a weight and confirm it completes.
await firstRow.locator('input').first().fill('135');
await firstRow.locator('.set-check').click();
await page.waitForTimeout(250);
console.log(
  'completes once a weight is entered:',
  (await firstRow.locator('.set-check').getAttribute('aria-pressed')) === 'true',
);

// --- 2. Substitution sheet
await page.getByRole('button', { name: 'Swap' }).click();
await page.waitForTimeout(400);
const swapTitle = await page.locator('.sheet-title').first().textContent();
const swapOptions = await page.locator('.sheet .choice').count();
console.log('swap sheet:', swapTitle, '| alternatives offered:', swapOptions);
await page.screenshot({ path: `${SHOTS}/31-swap.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- 3. Short-workout mode
await page.getByRole('button', { name: 'Less time' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/32-less-time.png` });
await page.locator('.sheet .choice', { hasText: 'Minimum' }).first().click();
await page.waitForTimeout(400);
const afterTrim = await page.locator('.tiny').first().textContent();
console.log('after minimum mode:', afterTrim.replace(/\s+/g, ' ').trim());

// --- 4. Complete the whole session and check the achievement celebration.
for (let e = 0; e < 8; e++) {
  const rows = page.locator('.set-row');
  const rn = await rows.count();
  for (let i = 0; i < rn; i++) {
    const row = rows.nth(i);
    const load = row.locator('input').first();
    if ((await load.inputValue()) === '') await load.fill('135');
    const chk = row.locator('.set-check');
    if ((await chk.getAttribute('aria-pressed')) === 'false') await chk.click();
    await page.waitForTimeout(60);
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
  const heading = await page.locator('.celebrate h1').first().textContent().catch(() => null);
  if (!heading) break;
  stages.push(heading);
  await page.screenshot({ path: `${SHOTS}/33-celebrate-${i}.png` });
  const b = page.getByRole('button', { name: /^(Done|Next)$/ });
  if ((await b.count()) === 0) break;
  await b.first().click();
  await page.waitForTimeout(500);
}
console.log('celebration stages shown:', stages);

await browser.close();
console.log('\nerrors:', errors.length ? errors : 'none');
