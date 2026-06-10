import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();

// 3a. 监听所有控制台消息（包括报错）
page.on('console', msg => {
  console.log(`[CONSOLE.${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
  console.log(`[PAGE_ERROR] ${err.message}`);
  console.log(err.stack?.split('\n').slice(0, 5).join('\n'));
});
page.on('response', response => {
  if (!response.ok()) {
    console.log(`[HTTP ${response.status()}] ${response.url()}`);
  }
});
page.on('requestfailed', request => {
  console.log(`[REQUEST_FAILED] ${request.url()} - ${request.failure()?.errorText}`);
});

// 3b. 打开首页
console.log('=== 导航到首页 ===');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000)); // 给 JS 执行时间

// 3c. 检查当前 URL（看是否重定向了）
console.log(`\n=== 当前 URL: ${page.url()} ===`);

// 3d. 获取页面 body 内容
const bodyContent = await page.evaluate(() => {
  const body = document.body;
  return {
    html: body?.innerHTML?.substring(0, 2000),
    childCount: body?.childElementCount || 0,
    text: body?.innerText?.substring(0, 500),
    className: body?.className,
    style: body?.getAttribute('style'),
  };
});
console.log('\n=== Body 内容 ===');
console.log(JSON.stringify(bodyContent, null, 2));

// 3e. 检查是否有 React root
const reactRoot = await page.evaluate(() => {
  const root = document.getElementById('__next');
  return {
    exists: !!root,
    innerHTML: root?.innerHTML?.substring(0, 1000),
    childCount: root?.childElementCount || 0,
    dataReactroot: root?.hasAttribute('data-reactroot'),
  };
});
console.log('\n=== React Root (#__next) ===');
console.log(JSON.stringify(reactRoot, null, 2));

// 3f. 检查是否有 JS 错误阻止了渲染
const jsErrors = await page.evaluate(() => {
  // 检查是否有错误被 React Error Boundary 捕获
  const errors = [];
  if (typeof window !== 'undefined') {
    // @ts-ignore
    if (window.__NEXT_DATA__) {
      errors.push({ type: '__NEXT_DATA__', data: JSON.stringify(window.__NEXT_DATA__).substring(0, 500) });
    }
  }
  return errors;
});
console.log('\n=== Next.js 数据 ===');
console.log(JSON.stringify(jsErrors, null, 2));

// 3g. 截图保存
await page.screenshot({ path: '/tmp/homepage.png', fullPage: true });
console.log('\n=== 截图已保存: /tmp/homepage.png ===');

// 3h. 检查网络请求的 HTML 内容
console.log('\n=== 等待 10 秒后的最终状态 ===');
await new Promise(r => setTimeout(r, 10000));
const finalUrl = page.url();
console.log(`最终 URL: ${finalUrl}`);
const finalBody = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
console.log(`最终可见文字: ${finalBody}`);

await browser.close();
