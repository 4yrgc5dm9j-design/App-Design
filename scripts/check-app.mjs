// Öffnet die veröffentlichte App wie ein iPhone und protokolliert Inhalte, Fehler und fehlgeschlagene Abrufe.
import { chromium, devices } from 'playwright';
const URL = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('pulse.state.v1')) localStorage.setItem('pulse.state.v1', JSON.stringify({ onboarded: true, profile: { name: 'Test', city: 'Berlin', lat: 52.52, lon: 13.405 } }));
});
const page = await ctx.newPage();
const log = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(`CONSOLE ${m.type()}: ${m.text()}`); });
page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
page.on('requestfailed', r => log.push(`FAILED ${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
page.on('response', r => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
const text = async sel => (await page.locator(sel).first().innerText().catch(() => '–')).replace(/\s+/g, ' ').slice(0, 700);
try {
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(10000);
console.log('=== BODY ===\n' + (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600));
console.log('=== HTML ===\n' + (await page.evaluate(() => document.documentElement.outerHTML)).slice(0, 1500));
console.log('=== HEUTE ===\n' + await text('.view.active'));
await page.screenshot({ path: 'shots/1-heute.png' });
for (const tab of ['boerse', 'sport', 'news']) {
  await page.click(`#tabbar [data-tab="${tab}"]`, { timeout: 5000 });
  await page.waitForTimeout(8000);
  console.log(`=== ${tab.toUpperCase()} ===\n` + await text('.view.active'));
  await page.screenshot({ path: `shots/${tab}.png` });
}
} catch (e) { console.log('ABBRUCH: ' + e.message.split('\n').slice(0, 8).join(' | ')); }
console.log('=== LOG ===\n' + [...new Set(log)].join('\n'));
await browser.close();
