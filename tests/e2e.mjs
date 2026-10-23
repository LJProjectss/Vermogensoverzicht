// Browsertest van de gebouwde app in Edge of Chrome (die al op de computer staan), of een andere Chromium.
// Uitvoeren: npm run test:e2e   (bouwt eerst de app)
// Schermafbeeldingen komen in tests/screenshots/.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const PORT = 4179;
const URL0 = `http://localhost:${PORT}/vermogen/`; // app draait onder base /vermogen/
const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
// Volgorde: een eigen pad (CHROME_PATH), Edge, Chrome, en anders de Chromium van Playwright
// (eenmalig te installeren met: npx playwright install chromium).
let browser;
const options = [
  process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
  { channel: 'msedge' },
  { channel: 'chrome' },
  {},
].filter(Boolean);
for (const opt of options) {
  try { browser = await chromium.launch({ ...opt, headless: true }); break; } catch { /* volgende proberen */ }
}
if (!browser) throw new Error('Geen browser gevonden. Installeer Edge of Chrome, of zet CHROME_PATH naar een Chromium-browser.');

const errors = [];
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FOUT'} - ${label}`);
  if (!ok) failures++;
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = (label) => page.locator('.sidebar .side-item', { hasText: label }).first().click();
  const shot = (name, fullPage = true) => page.screenshot({ path: OUT + name + '.png', fullPage });

  await page.goto(URL0);
  await page.waitForSelector('.shell');
  await nav('Data & instellingen');
  await page.getByRole('button', { name: 'Voorbeelddata laden' }).click();
  await page.waitForSelector('.banner.ok');

  // Overzicht + back-upherinnering + inflatie
  await nav('Overzicht');
  await page.waitForSelector('.ledger');
  check((await page.locator('.todo-card li', { hasText: 'back-up' }).count()) === 1, 'back-upherinnering zichtbaar');
  await page.locator('label.switch', { hasText: 'Gecorrigeerd voor inflatie' }).click();
  await page.waitForFunction(() => /CBS-maand|niet worden opgehaald/.test(document.querySelector('.inflation-note')?.textContent || ''), null, { timeout: 30000 });
  check(/CBS-maand/.test(await page.locator('.inflation-note').textContent()), 'CBS-inflatiecijfers opgehaald');
  await page.locator('label.switch', { hasText: 'Gecorrigeerd voor inflatie' }).click();
  await shot('overzicht');

  // Invoer: typefout-waarschuwing
  await nav('Maand invullen');
  await page.waitForSelector('.entry-row');
  const firstInput = page.locator('.entry-row .money input').first();
  const prevValue = await firstInput.inputValue();
  const n = Number(prevValue.replace(/\./g, '').replace(',', '.'));
  await firstInput.fill(String(Math.round(n * 10)).replace('.', ','));
  check((await page.locator('.typo-warn').count()) > 0, 'typefout gemarkeerd bij 10× hogere stand');
  await page.locator('.save-bar button.primary').click();
  await page.waitForSelector('text=Klopt dit?');
  check(true, 'opslaan vraagt eerst bevestiging');
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  await firstInput.fill(prevValue);
  await page.locator('.save-bar button.primary').click();
  await page.waitForSelector('text=opgeslagen');
  check(true, 'opslaan zonder waarschuwing na herstel');

  // Maand verwijderen + ongedaan maken
  await page.getByRole('button', { name: 'Maand verwijderen' }).click();
  await page.getByRole('button', { name: 'Ja, verwijderen' }).click();
  await page.waitForSelector('.toast');
  check(await page.locator('.save-bar button.primary', { hasText: 'Maand opslaan' }).isVisible(), 'maand verwijderd');
  await page.locator('.toast button', { hasText: 'Ongedaan maken' }).click();
  await page.waitForSelector('.save-bar button.primary:has-text("Opgeslagen")');
  check(true, 'ongedaan maken zet de maand terug');

  // Analyse
  await nav('Analyse');
  await page.waitForSelector('text=Verloop per rekening');
  await page.getByLabel('Uitgaven per maand', { exact: true }).fill('2.500');
  await page.getByLabel('Uitgaven per maand', { exact: true }).press('Enter');
  await page.getByLabel('Gewenst aandeel beleggingen').fill('60');
  await page.getByLabel('Gewenst aandeel beleggingen').press('Enter');
  await page.waitForTimeout(300);
  check(/maanden/.test(await page.locator('.card', { hasText: 'Noodbuffer' }).locator('.mini-kpis').textContent()), 'noodbuffer in maanden');
  check(/naar (beleggen|cash)|Zit goed/.test(await page.locator('.card', { hasText: 'Noodbuffer' }).textContent()), 'herverdeling berekend');
  check(/Overwaarde/.test(await page.locator('.card:has(h2:text-is("Woning"))').textContent()), 'woningkaart met overwaarde');
  check(/FI-getal/.test(await page.locator('.card', { hasText: 'Financiële onafhankelijkheid' }).textContent()), 'FI-getal zichtbaar');
  await page.locator('.card', { hasText: 'Verloop per rekening' }).locator('select').selectOption({ label: 'Interactive Brokers' });
  check(/Rendement tot nu/.test(await page.locator('.card', { hasText: 'Verloop per rekening' }).textContent()), 'grafiek per rekening met rendement');
  await shot('analyse');
  await page.emulateMedia({ media: 'print' });
  check(!(await page.locator('.sidebar').isVisible()), 'printweergave verbergt menu');
  await page.pdf({ path: OUT + 'jaarrapport.pdf', format: 'A4' });
  await page.emulateMedia({ media: 'screen' });

  // Rekening verwijderen + ongedaan maken
  await nav('Rekeningen');
  const before = await page.locator('.acc-row').count();
  await page.locator('.acc-row').last().getByRole('button', { name: 'Verwijderen' }).click();
  await page.getByRole('button', { name: 'Definitief verwijderen' }).click();
  check((await page.locator('.acc-row').count()) === before - 1, 'rekening verwijderd');
  await page.locator('.toast button', { hasText: 'Ongedaan maken' }).click();
  check((await page.locator('.acc-row').count()) === before, 'rekening teruggezet');

  // Agendaherinnering
  await nav('Data & instellingen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herinnering toevoegen aan agenda' }).click()]);
  check(download.suggestedFilename().endsWith('.ics'), 'agendabestand gedownload');

  // Pincode
  await page.getByRole('button', { name: 'Pincode instellen' }).click();
  await page.getByLabel(/^Pincode \(4/).fill('135790');
  await page.getByLabel('Herhaal pincode').fill('135790');
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await page.waitForSelector('text=Pincode ingesteld');
  check(await page.evaluate(() => !localStorage.getItem('vermogensoverzicht.v1')), 'gegevens versleuteld opgeslagen');
  await page.reload();
  await page.waitForSelector('.lock-screen');
  await page.getByLabel('Pincode').fill('000000');
  await page.getByRole('button', { name: 'Ontgrendelen' }).click();
  await page.waitForSelector('text=Onjuiste pincode');
  await page.getByLabel('Pincode').fill('135790');
  await page.getByRole('button', { name: 'Ontgrendelen' }).click();
  await page.waitForSelector('.shell');
  check(true, 'vergrendelen en ontgrendelen');
  await nav('Data & instellingen');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Pincode uitzetten' }).click();
  await page.waitForSelector('text=Pincode uitgezet');

  // Offline
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1000);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.shell', { timeout: 10000 });
  await nav('Analyse');
  await page.waitForSelector('text=Jaaroverzicht', { timeout: 10000 });
  check(true, 'werkt offline (ook lazy geladen Analyse)');
  await ctx.setOffline(false);

  // Mobiel
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobiel: ' + e.message));
  await mp.goto(URL0);
  await mp.locator('.bottom-item', { hasText: 'Data' }).click();
  await mp.getByRole('button', { name: 'Voorbeelddata laden' }).click();
  for (const tab of ['Overzicht', 'Invullen', 'Analyse', 'Rekeningen', 'Data']) {
    await mp.locator('.bottom-item', { hasText: tab }).click();
    await mp.waitForTimeout(400);
    check(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `mobiel ${tab}: geen horizontaal scrollen`);
  }
  await mp.locator('.bottom-item', { hasText: 'Analyse' }).click();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: OUT + 'mobiel-analyse.png', fullPage: true });

  check(errors.length === 0, `geen fouten in de console${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

console.log(failures ? `\n${failures} controle(s) mislukt` : '\nAlle browsercontroles geslaagd');
process.exit(failures ? 1 : 0);
