import { test, expect } from '@playwright/test';

const BASE_URL = 'https://umami.agate.workers.dev';

test.describe('Admin Users Page - TypeError Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Track all console errors and page errors
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(`[PAGE_ERROR] ${error.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`[CONSOLE_ERROR] ${msg.text()}`);
      }
    });

    // Attach errors to test data for assertion
    (page as any).__errors = errors;
  });

  test('login and navigate to admin users page without TypeError', async ({ page }) => {
    // Step 1: Go to login page
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Step 2: Login with default admin credentials
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="Email"]', 'admin');
    await page.fill('input[type="password"]', 'umami');
    await page.click('button[type="submit"]');

    // Step 3: Wait for login to complete and navigate to admin users
    await page.waitForURL('**/dashboard/**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Step 4: Navigate directly to admin users page
    await page.goto(`${BASE_URL}/admin/users`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for full render
    await page.waitForTimeout(5000);

    // Step 5: Verify no TypeError about 'websites'
    const errors = (page as any).__errors as string[];
    console.log('Captured errors:', JSON.stringify(errors, null, 2));

    const websitesError = errors.find(
      (e) =>
        e.includes('Cannot read properties of undefined') && e.includes('websites'),
    );
    expect(websitesError).toBeUndefined();

    // No TypeError at all
    const typeErrors = errors.filter((e) => e.includes('TypeError'));
    expect(typeErrors).toEqual([]);

    // Step 6: Verify page rendered content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('navigate to admin users via sidebar without TypeError', async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="Email"]', 'admin');
    await page.fill('input[type="password"]', 'umami');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Try to find and click an admin/users link in the sidebar/nav
    const adminLink = page.locator('a[href*="admin/users"], a:has-text("Users")').first();
    if (await adminLink.isVisible().catch(() => false)) {
      await adminLink.click();
      await page.waitForTimeout(5000);
    }

    // Verify no TypeError
    const errors = (page as any).__errors as string[];
    const websitesError = errors.find(
      (e) =>
        e.includes('Cannot read properties of undefined') && e.includes('websites'),
    );
    expect(websitesError).toBeUndefined();
  });
});
