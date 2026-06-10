import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();

// 捕获所有错误，包括 unhandled rejection
await page.addInitScript(() => {
  window.addEventListener('error', (e) => {
    console.error('[GLOBAL_ERROR]', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[UNHANDLED_REJECTION]', e.reason?.message || e.reason);
  });
  // 监控 React 错误
  const originalConsoleError = console.error;
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    // @ts-ignore
    if (window.__capturedErrors) window.__capturedErrors.push(args.join(' '));
    else window.__capturedErrors = [args.join(' ')];
  };
});

page.on('console', msg => {
  console.log(`[${msg.type().toUpperCase()}] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
  console.log(`[PAGE_ERROR] ${err.message}`);
  console.log(err.stack?.split('\n').slice(0, 3).join('\n'));
});

// 检查网络：记录所有 API 请求
page.on('response', response => {
  const url = response.url();
  if (url.includes('/api/')) {
    console.log(`[API ${response.status()}] ${url.substring(0, 100)}`);
  }
  if (!response.ok() && !url.includes('.js') && !url.includes('.css') && !url.includes('.woff')) {
    console.log(`[HTTP ${response.status()}] ${url.substring(0, 100)}`);
  }
});

console.log('=== 导航到首页 ===');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 8000));

// 捕获所有内容和错误
const result = await page.evaluate(() => {
  const r = {};
  
  // 捕获所有 console.error 记录
  // @ts-ignore
  r.capturedErrors = window.__capturedErrors || [];
  
  // 完整的 body HTML
  r.bodyHTML = document.body.innerHTML;

  // 检查所有 div 及其计算样式
  const divs = document.querySelectorAll('div');
  r.divCount = divs.length;
  r.divDetails = [];
  divs.forEach((d, i) => {
    if (i < 20) {
      const cs = window.getComputedStyle(d);
      r.divDetails.push({
        id: d.id,
        className: d.className?.substring(0, 40),
        hidden: d.hidden,
        children: d.childElementCount,
        textLen: d.textContent?.length || 0,
        display: cs.display,
        position: cs.position,
        w: Math.round(parseFloat(cs.width)),
        h: Math.round(parseFloat(cs.height)),
        overflow: cs.overflow,
        opacity: cs.opacity,
      });
    }
  });

  // 检查 next-intl 状态
  r.nextIntl = typeof window.__NEXT_INTL__;

  // 检查是否有任何 react root 容器
  r.allIds = [];
  document.querySelectorAll('[id]').forEach(el => r.allIds.push(el.id));

  // 检查关键 store 状态
  r.storeState = {};
  try {
    const appState = window.__ZUSTAND_STORE__ || {};
    r.storeState = { keys: Object.keys(appState) };
  } catch {}

  return r;
});

console.log('\n========== 终极诊断结果 ==========');
console.log(JSON.stringify(result, null, 2).substring(0, 3000));

// 检查 API 调用
console.log('\n========== 直接测试 API ==========');
const apiResults = await page.evaluate(async () => {
  const results = {};
  
  try {
    const configRes = await fetch('/api/config');
    const configData = await configRes.json();
    results.config = { status: configRes.status, data: configData };
  } catch (e) {
    results.config = { error: e.message };
  }

  try {
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const verifyData = await verifyRes.json();
    results.verify = { status: verifyRes.status, data: verifyData };
  } catch (e) {
    results.verify = { error: e.message };
  }

  return results;
});
console.log(JSON.stringify(apiResults, null, 2));

// 检查国际化消息
console.log('\n========== 测试国际化消息 ==========');
const msgResult = await page.evaluate(async () => {
  try {
    const res = await fetch('/intl/messages/en-US.json');
    const data = await res.json();
    return { status: res.status, keys: Object.keys(data).slice(0, 10) };
  } catch (e) {
    return { error: e.message };
  }
});
console.log(JSON.stringify(msgResult, null, 2));

// 给 React 更多时间渲染
console.log('\n=== 等待额外 10 秒 ===');
await new Promise(r => setTimeout(r, 10000));
const finalHTML = await page.evaluate(() => {
  return {
    url: window.location.href,
    bodyChildCount: document.body.childElementCount,
    bodyText: document.body.innerText?.substring(0, 300),
    bodyHTML: document.body.innerHTML.substring(0, 2000),
  };
});
console.log(JSON.stringify(finalHTML, null, 2));

await browser.close();
