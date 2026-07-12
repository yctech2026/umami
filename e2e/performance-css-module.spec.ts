import { test, expect } from '@playwright/test';

const BASE_URL = 'https://umami.agate.workers.dev';

test.describe('Performance 页面 CSS Module 修复验证', () => {
  test('Performance 页面不应有 sampleCount JS 错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(`[PAGEERROR] ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[CONSOLE:${msg.type()}] ${msg.text()}`);
    });

    // Step 1: 登录
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.fill(
      'input[type="email"], input[name="email"], input[placeholder*="Email"]',
      'admin',
    );
    await page.fill('input[type="password"]', 'umami');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard/**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 清空误差
    errors.length = 0;

    // Step 2: 找侧边栏或导航中的 Performance 链接并点击
    const perfSelectors = [
      'a[href*="/performance"]',
      'a:has-text("Performance")',
      'nav a:has-text("Performance")',
      '[role="navigation"] a:has-text("Performance")',
      'text=Performance >> nth=0',
    ];

    let clicked = false;
    for (const sel of perfSelectors) {
      const link = page.locator(sel).first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Clicking Performance link via: ${sel}`);
        await link.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // 如果没有直接找到 Performance 链接，先导航到网站列表再尝试
      console.log('Direct Performance link not found, trying website list...');
      await page.goto(`${BASE_URL}/websites`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 点击第一个网站
      const siteLink = page.locator('a[href*="/websites/"]').first();
      if (await siteLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await siteLink.click();
        await page.waitForTimeout(3000);

        // 现在找 Performance 链接
        for (const sel of perfSelectors) {
          const link = page.locator(sel).first();
          if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`Clicking Performance link via: ${sel}`);
            await link.click();
            clicked = true;
            break;
          }
        }
      }
    }

    console.log('Performance link clicked:', clicked);
    console.log('Current URL:', page.url());

    // Step 3: 等待数据加载
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Step 4: 检查页面内容
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('Page content length:', bodyText.length);
    console.log('Page first 500 chars:', bodyText.substring(0, 500));
    console.log('Captured errors:', JSON.stringify(errors, null, 2));

    // Step 5: 断言
    const sampleCountErrors = errors.filter(
      e => e.includes('sampleCount') || e.includes('Cannot read properties of undefined'),
    );
    expect(sampleCountErrors).toEqual([]);

    const typeErrors = errors.filter(e => e.includes('TypeError'));
    expect(typeErrors).toEqual([]);

    expect(bodyText).not.toContain('发生错误');
    expect(bodyText.length).toBeGreaterThan(50);
  });
});
