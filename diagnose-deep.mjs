import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();

// 捕获所有 console 和网络错误
const errors = [];
const warnings = [];
page.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error') errors.push(`[ERR] ${text}`);
  else if (msg.type() === 'warning') warnings.push(`[WARN] ${text}`);
  else console.log(`[CONSOLE.${msg.type()}] ${text.substring(0, 200)}`);
});
page.on('pageerror', err => {
  errors.push(`[PAGE_ERROR] ${err.message}`);
});
page.on('response', response => {
  if (!response.ok()) {
    console.log(`[HTTP ${response.status()}] ${response.url()}`);
  }
});

console.log('=== 导航到首页 ===');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

// 全量 DOM 结构分析
const domAnalysis = await page.evaluate(() => {
  const results = {};

  // 1. 检查 head 中的关键元素
  results.title = document.title;
  results.viewport = document.querySelector('meta[name="viewport"]')?.content;

  // 2. 所有 body 的直接子元素
  const children = [];
  document.body.childNodes.forEach((node, i) => {
    if (node.nodeType === 1) {
      const el = node;
      children.push({
        tag: el.tagName,
        id: el.id,
        className: el.className?.substring(0, 100),
        visible: el.offsetParent !== null,
        rect: el.getBoundingClientRect ? {
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
          top: el.getBoundingClientRect().top,
          left: el.getBoundingClientRect().left
        } : null,
        innerHTML_preview: el.innerHTML?.substring(0, 150),
        childCount: el.childElementCount,
        textContent: el.textContent?.trim()?.substring(0, 100),
        hidden: el.hidden,
        ariaHidden: el.getAttribute('aria-hidden'),
        style: el.getAttribute('style')?.substring(0, 100),
      });
    } else if (node.nodeType === 8) {
      // comment node
    } else if (node.nodeType === 3) {
      // text node
    }
  });
  results.bodyChildren = children;

  // 3. 查找所有可见元素
  const allElements = document.querySelectorAll('body *');
  const visibleElements = [];
  allElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < 9999) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        visibleElements.push({
          tag: el.tagName,
          id: el.id,
          text: el.textContent?.trim()?.substring(0, 80),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }
  });
  results.visibleElements = visibleElements;

  // 4. 检查特定的 container/root 元素
  const possibleRoots = ['__next', 'root', 'app', 'main', 'layout'];
  possibleRoots.forEach(id => {
    const el = document.getElementById(id);
    results[`#${id}`] = el ? {
      exists: true,
      innerHTML: el.innerHTML?.substring(0, 300),
      childCount: el.childElementCount,
      rect: el.getBoundingClientRect ? {
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height
      } : null
    } : { exists: false };
  });

  // 5. 检查 next.js 特有的数据属性
  results.nextData = {
    __next_f: typeof window.__next_f !== 'undefined' ? `Array length: ${window.__next_f?.length}` : 'undefined',
    __rsc: typeof window.__rsc !== 'undefined' ? 'exists' : 'undefined',
  };

  // 6. 检查 CSS 可能隐藏内容
  const styleSheet = document.styleSheets;
  results.styleSheetCount = styleSheet.length;

  // 7. 检查现代框架注入的内容
  results.bodyHTML = document.body.innerHTML.substring(0, 5000);

  return results;
});

console.log('\n========== 深度 DOM 分析 ==========');
console.log(JSON.stringify(domAnalysis, null, 2));

// 检查是否有特定错误
console.log('\n========== 错误汇总 ==========');
if (errors.length === 0) console.log('✅ 无 JS 错误');
else errors.forEach(e => console.log(`❌ ${e}`));

if (warnings.length === 0) console.log('✅ 无 JS 警告');
else warnings.forEach(w => console.log(`⚠️ ${w}`));

// 额外检查：Network 请求
console.log('\n========== 页面性能/资源加载 ==========');
const perfData = await page.evaluate(() => {
  const entries = performance.getEntriesByType('resource');
  return entries.map(e => ({
    name: e.name.substring(0, 80),
    duration: Math.round(e.duration),
    type: e.initiatorType,
  })).slice(0, 30);
});
console.log(JSON.stringify(perfData, null, 2));

await page.screenshot({ path: '/tmp/homepage-deep.png', fullPage: true });
console.log('\n截图已保存: /tmp/homepage-deep.png');

await browser.close();
