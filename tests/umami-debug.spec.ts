import { test, expect } from '@playwright/test';

const BASE = 'https://umami.agate.workers.dev';

test('Compare login vs signup page forms', async ({ page }) => {
  // Check signup page
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  const signupInputs = await page.locator('input').count();
  console.log('=== SIGNUP PAGE ===');
  console.log('URL:', page.url());
  for (let i = 0; i < signupInputs; i++) {
    const el = page.locator('input').nth(i);
    console.log(`  Input ${i}: name="${await el.getAttribute('name')}" type="${await el.getAttribute('type')}" placeholder="${await el.getAttribute('placeholder')}"`);
  }
  const signupBtn = await page.locator('button[type="submit"]').textContent();
  console.log('  Submit button:', signupBtn);
  
  // Check login page
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  const loginInputs = await page.locator('input').count();
  console.log('=== LOGIN PAGE ===');
  console.log('URL:', page.url());
  for (let i = 0; i < loginInputs; i++) {
    const el = page.locator('input').nth(i);
    console.log(`  Input ${i}: name="${await el.getAttribute('name')}" type="${await el.getAttribute('type')}" placeholder="${await el.getAttribute('placeholder')}"`);
  }
  const loginBtn = await page.locator('button[type="submit"]').textContent();
  console.log('  Submit button:', loginBtn);
  
  // Check h2 text on both
  console.log('Signup h2:', await page.locator('h2').textContent());
  
  // Go back to signup to check h2
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  console.log('Login h2:', await page.locator('h2').textContent());
});
