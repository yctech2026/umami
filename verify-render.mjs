import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

console.log('=== HOME PAGE ===');
page.on('console', msg => {
  if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
});
page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));
page.on('load', () => console.log('Event: load'));
page.on('domcontentloaded', () => console.log('Event: DOMContentLoaded'));

await page.goto('http://localhost:3000/', { timeout: 20000, waitUntil: 'networkidle' });
console.log('Waiting extra 8s for client-side render...');
await new Promise(r => setTimeout(r, 8000));

const url = page.url();
console.log(`Final URL: ${url}`);

// Check HTML structure
const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 500));
console.log(`HTML head: ${html}`);

const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 800));
console.log(`Body HTML: "${bodyHTML}"`);

const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
console.log(`Body text: "${bodyText}"`);
console.log(`Body has text: ${bodyText.trim().length > 0}`);

const bodyChildren = await page.evaluate(() => document.body.children.length);
console.log(`Body children: ${bodyChildren}`);

// Check root/__next mount point
const nextDiv = await page.evaluate(() => {
  const root = document.getElementById('__next');
  if (root) return { exists: true, children: root.children.length, html: root.innerHTML.substring(0, 300) };
  const app = document.getElementById('root');
  if (app) return { exists: true, id: 'root', children: app.children.length, html: app.innerHTML.substring(0, 300) };
  return { exists: false, availableIds: Array.from(document.querySelectorAll('[id]')).map(e => e.id).join(', ') };
});
console.log(`Mount point: ${JSON.stringify(nextDiv)}`);

// Check visible elements (detailed)
const visibleInfo = await page.evaluate(() => {
  const all = document.querySelectorAll('body *');
  let visible = 0;
  const tags = {};
  all.forEach(el => {
    const style = window.getComputedStyle(el);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    if (isVisible) {
      visible++;
      const tag = el.tagName.toLowerCase();
      tags[tag] = (tags[tag] || 0) + 1;
    }
  });
  return { total: all.length, visible, tags };
});
console.log(`Visible elements detail: ${JSON.stringify(visibleInfo)}`);

// Check for errors in the page
const errorElements = await page.evaluate(() => {
  return document.querySelectorAll('[data-error], [role="alert"], .error, .alert').length;
});
console.log(`Error elements on page: ${errorElements}`);

// Screenshot
await page.screenshot({ path: '/tmp/verified-home.png', fullPage: true });
console.log('Home screenshot saved to /tmp/verified-home.png');

// === LOGIN PAGE ===
console.log('\n=== LOGIN PAGE ===');
await page.goto('http://localhost:3000/login', { timeout: 20000, waitUntil: 'networkidle' });
await new Promise(r => setTimeout(r, 8000));

const loginUrl = page.url();
console.log(`Login URL: ${loginUrl}`);

const loginHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 800));
console.log(`Login Body HTML: "${loginHTML}"`);

const loginText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
console.log(`Login text: "${loginText}"`);

// Check login mount point
const loginMount = await page.evaluate(() => {
  const root = document.getElementById('__next');
  if (root) return { exists: true, children: root.children.length };
  return null;
});
console.log(`Login mount: ${JSON.stringify(loginMount)}`);

const loginVisible = await page.evaluate(() => {
  const all = document.querySelectorAll('body *');
  let visible = 0;
  all.forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null) visible++;
  });
  return visible;
});
console.log(`Login visible elements: ${loginVisible}`);

await page.screenshot({ path: '/tmp/verified-login.png', fullPage: true });
console.log('Login screenshot saved to /tmp/verified-login.png');

await browser.close();
