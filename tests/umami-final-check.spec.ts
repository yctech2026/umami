import { test, expect } from '@playwright/test';

const BASE = 'https://umami.agate.workers.dev';

test.describe('Final Alignment Check', () => {
  
  test('Login page - all elements present', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('h2')).toContainText('Log in');
    await expect(page.locator('text=Umami Cloud')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('text=© 2026 Umami Software')).toBeVisible();
    await expect(page.locator('text=Don\'t have an account?')).toBeVisible();
    await expect(page.locator('text=Forgot password?')).toBeVisible();
    
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
  });

  test('Signup page - all elements present', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('h2')).toContainText('Sign up');
    await expect(page.locator('text=Umami Cloud')).toBeVisible();
    await expect(page.locator('text=Name')).toBeVisible();
    await expect(page.locator('text=Email address')).toBeVisible();
    await expect(page.getByText('Password', { exact: true })).toBeVisible();
    await expect(page.locator('text=© 2026 Umami Software')).toBeVisible();
    await expect(page.locator('text=Already have an account?')).toBeVisible();
    await expect(page.locator('text=self-host')).toBeVisible();
    
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  });

  test('Signup then login flow works end-to-end', async ({ context }) => {
    const testUser = `e2e_${Date.now()}@test.com`;
    
    // Step 1: Sign up
    const signupPage = await context.newPage();
    await signupPage.goto(`${BASE}/signup`);
    await signupPage.waitForLoadState('networkidle');
    await signupPage.locator('input[name="name"]').fill('E2E Test');
    await signupPage.locator('input[name="email"]').fill(testUser);
    await signupPage.locator('input[name="password"]').fill('TestPass123!');
    
    // Submit and wait for navigation or page update
    await Promise.all([
      signupPage.waitForResponse(resp => 
        resp.url().includes('/api/auth') && resp.status() < 400
      ),
      signupPage.click('button[type="submit"]')
    ]);
    
    // Signup succeeded - user is registered
    await expect(signupPage.locator('body')).not.toContainText('error', { timeout: 5000 });
    await signupPage.close();
    
    // Step 2: Login in a clean browser session
    const loginContext = await context.browser()!.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${BASE}/login`);
    await loginPage.waitForLoadState('networkidle');
    
    await expect(loginPage.locator('input[name="email"]')).toBeVisible({ timeout: 10000 });
    await loginPage.locator('input[name="email"]').fill(testUser);
    await loginPage.locator('input[name="password"]').fill('TestPass123!');
    
    await Promise.all([
      loginPage.waitForURL(`${BASE}/`, { timeout: 20000 }),
      loginPage.click('button[type="submit"]')
    ]);
    
    await expect(loginPage).toHaveURL(BASE + '/');
    await loginContext.close();
  });
});
