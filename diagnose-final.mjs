import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();

const allLogs = [];
page.on('console', msg => {
  allLogs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
  allLogs.push(`[PAGE_ERROR] ${err.message}`);
});
page.on('response', response => {
  if (!response.ok()) {
    allLogs.push(`[HTTP ${response.status()}] ${response.url()}`);
  }
});
page.on('requestfailed', request => {
  allLogs.push(`[REQUEST_FAILED] ${request.url()} - ${request.failure()?.errorText}`);
});

// 检查 env 变量
console.log('=== 检查环境变量 ===');
const envCheck = await page.evaluate(async () => {
  const res = await fetch('/api/config');
  const data = await res.json();
  return data;
}).catch(() => 'FAILED_TO_FETCH_CONFIG');
console.log('Config API:', JSON.stringify(envCheck, null, 2).substring(0, 1000));

console.log('\n=== 导航到首页 ===');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

// 深度检查 React 渲染状态
const deepCheck = await page.evaluate(() => {
  const results = {};

  // 检查所有 React 创建的元素
  const allDivs = document.querySelectorAll('div');
  const divInfo = [];
  allDivs.forEach((div, i) => {
    if (i < 30) {
      const rect = div.getBoundingClientRect();
      const style = window.getComputedStyle(div);
      divInfo.push({
        tag: div.tagName,
        id: div.id,
        className: div.className.substring(0, 60),
        rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
        hidden: div.hidden,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        innerHTML_preview: div.innerHTML.substring(0, 80),
        textContent: div.textContent?.trim()?.substring(0, 60),
        dataReactRoot: div.hasAttribute('data-reactroot'),
        __reactFiber: typeof div[Object.keys(div).find(k => k.startsWith('__reactFiber'))] !== 'undefined',
      });
    }
  });
  results.divs = divInfo;

  // 检查是否有任何 React root 容器
  results.reactRoots = [];
  const roots = document.querySelectorAll('[id^="__next"], [id^="__react"], [data-reactroot]');
  roots.forEach(r => {
    results.reactRoots.push({
      id: r.id,
      tag: r.tagName,
      html: r.innerHTML.substring(0, 200),
    });
  });

  // 检查 body 中非 script 的可见元素
  const visibleNonScript = [];
  document.querySelectorAll('body > *:not(script):not(style)').forEach(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (rect.width > 0 && rect.height > 0) {
      visibleNonScript.push({
        tag: el.tagName,
        id: el.id,
        className: el.className?.substring(0, 60),
        rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        display: style.display,
      });
    }
  });
  results.visibleNonScript = visibleNonScript;

  // 检查 next.js 的内部状态
  results.next = {
    __next_f_length: Array.isArray(window.__next_f) ? window.__next_f.length : typeof window.__next_f,
    next_router: typeof window.next?.router,
    __NEXT_DATA__: typeof window.__NEXT_DATA__,
  };

  // 检查是否有错误边界捕获错误
  results.errorBoundaries = [];
  document.querySelectorAll('[data-error-boundary]').forEach(el => {
    results.errorBoundaries.push({
      text: el.textContent?.substring(0, 200),
    });
  });

  return results;
});

console.log('\n========== 深度 React 检查 ==========');
console.log(JSON.stringify(deepCheck, null, 2));

// 现在再等待重定向
console.log('\n=== 等待更多时间（15秒）检查重定向 ===');
await new Promise(r => setTimeout(r, 15000));
console.log(`当前 URL: ${page.url()}`);
const finalText = await page.evaluate(() => document.body.innerText?.substring(0, 500));
console.log(`页面文本: "${finalText}"`);
const finalVisible = await page.evaluate(() => {
  const els = document.querySelectorAll('body *');
  const visible = [];
  els.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.opacity !== '0') {
        visible.push({
          tag: el.tagName,
          text: el.textContent?.trim()?.substring(0, 50),
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        });
      }
    }
  });
  return visible.slice(0, 20);
});
console.log('可见元素:', JSON.stringify(finalVisible, null, 2));

// 检查重定向历史
console.log('\n=== 导航到 /websites 和 /login 直接测试 ===');
for (const testPath of ['/websites', '/login']) {
  try {
    await page.goto(`http://localhost:3000${testPath}`, { waitUntil: 'networkidle', timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));
    const text = await page.evaluate(() => document.body.innerText?.substring(0, 300));
    const url = page.url();
    console.log(`${testPath} -> URL: ${url}, 文本: "${text}"`);
  } catch (e) {
    console.log(`${testPath} -> 错误: ${e.message}`);
  }
}

console.log('\n========== 所有 Console 日志 ==========');
allLogs.forEach(l => console.log(l));

await browser.close();
