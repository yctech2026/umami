import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// 记录所有控制台消息
const consoleLogs = [];
page.on('console', msg => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
  console.log(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
  console.log(`\n[PAGE_ERROR] ${err.message}`);
  console.log(err.stack?.split('\n').slice(0, 3).join('\n'));
});

// 访问首页
console.log('=== 导航到首页 ===');
await page.goto('http://localhost:3000/', { timeout: 15000 });
await new Promise(r => setTimeout(r, 5000));

console.log(`\n=== 当前 URL: ${page.url()} ===`);

// 检查 #__next
const nextData = await page.evaluate(() => {
  const root = document.getElementById('__next');
  if (!root) return { exists: false };
  return {
    exists: true,
    childCount: root.children.length,
    innerHTML: root.innerHTML.substring(0, 1500),
    classList: [...root.classList],
  };
});
console.log('\n=== #__next ===');
console.log(JSON.stringify(nextData, null, 2));

// 检查 body
const bodyInfo = await page.evaluate(() => {
  return {
    childCount: document.body.children.length,
    innerHTML: document.body.innerHTML.substring(0, 1000),
    innerText: document.body.innerText.substring(0, 500),
  };
});
console.log('\n=== Body ===');
console.log(JSON.stringify(bodyInfo, null, 2));

// 检查 __NEXT_DATA__
const nextJSON = await page.evaluate(() => {
  return window.__NEXT_DATA__ ? JSON.stringify(window.__NEXT_DATA__).substring(0, 2000) : 'N/A';
});
console.log('\n=== __NEXT_DATA__ ===');
console.log(nextJSON);

// 检查 window 上的关键属性
const windowChecks = await page.evaluate(() => {
  const checks = {};
  checks['has_react'] = typeof React !== 'undefined';
  checks['has_nextRouter'] = typeof window.__NEXT_ROUTER__ !== 'undefined';
  checks['has_nextData'] = typeof window.__NEXT_DATA__ !== 'undefined';
  checks['location_href'] = window.location.href;
  // 检查是否有任何全局错误被捕获
  return checks;
});
console.log('\n=== Window Checks ===');
console.log(JSON.stringify(windowChecks, null, 2));

// 截图
await page.screenshot({ path: '/tmp/homepage2.png', fullPage: true });
console.log('\n截图已保存');

// 尝试等待更久
console.log('\n=== 等待 15 秒后再次检查 ===');
await new Promise(r => setTimeout(r, 15000));
const urlAfter = page.url();
console.log(`URL 15s 后: ${urlAfter}`);

const bodyAfter = await page.evaluate(() => {
  return {
    text: document.body.innerText.substring(0, 500),
    childCount: document.body.children.length,
  };
});
console.log('Body 15s 后:', JSON.stringify(bodyAfter));

// 尝试访问 /login 页面
console.log('\n=== 访问 /login ===');
await page.goto('http://localhost:3000/login', { timeout: 15000 });
await new Promise(r => setTimeout(r, 5000));
console.log(`Login URL: ${page.url()}`);
const loginBody = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log(`Login body: ${loginBody}`);
await page.screenshot({ path: '/tmp/login.png' });
console.log('Login 截图已保存');

await browser.close();
