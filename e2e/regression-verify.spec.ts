import { test, expect } from '@playwright/test';

const BASE = 'https://umami.agate.workers.dev';

test.describe('SSR闪烁修复回归验证', () => {
  test('SSR should render full form, not spinner', async ({ page }) => {
    // 登录页
    const resp1 = await page.goto(`${BASE}/login`);
    const html1 = await resp1.text();
    expect(html1).toContain('Log in');
    expect(html1).not.toContain('zen-spinner');
    expect(html1).not.toContain('circle cx="50" cy="50" r="20"');

    // 注册页
    const resp2 = await page.goto(`${BASE}/signup`);
    const html2 = await resp2.text();
    expect(html2).toContain('Sign up');
    expect(html2).not.toContain('zen-spinner');
  });

  test('Full register + login flow', async ({ page }) => {
    const testUser = `ssr_${Date.now()}@test.com`;

    // === 注册流程 ===
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="name"]', 'SSR Fix');
    await page.fill('input[name="email"]', testUser);
    await page.fill('input[name="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/websites**', { timeout: 15000 });
    expect(page.url()).toContain('/websites');

    // === 登出：清除状态 ===
    await page.evaluate(() => {
      localStorage.clear();
      document.cookie.split(';').forEach(c => {
        document.cookie = c.replace(/=.*/, '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;');
      });
    });
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');

    // SSR 仍输出完整表单
    const body = await page.textContent('body');
    expect(body).toContain('Log in');

    // === 登录流程 ===
    await page.fill('input[name="email"]', testUser);
    await page.fill('input[name="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/websites**', { timeout: 15000 });
    expect(page.url()).toContain('/websites');
  });
});
