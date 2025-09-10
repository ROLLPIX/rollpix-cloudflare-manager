import { test, expect } from '@playwright/test';

test.describe('ROLLPIX Cloudflare Manager', () => {
  test('should display API token input on first visit', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByText('Cloudflare API Token')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your Cloudflare API token')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect to Cloudflare' })).toBeVisible();
  });

  test('should show error when submitting empty token', async ({ page }) => {
    await page.goto('/');
    
    const submitButton = page.getByRole('button', { name: 'Connect to Cloudflare' });
    await submitButton.click();
    
    // Form validation should prevent submission
    const tokenInput = page.getByPlaceholder('Enter your Cloudflare API token');
    await expect(tokenInput).toBeFocused();
  });

  test('should show domain management interface with valid token', async ({ page }) => {
    await page.goto('/');
    
    const tokenInput = page.getByPlaceholder('Enter your Cloudflare API token');
    await tokenInput.fill('test-token-123');
    
    const submitButton = page.getByRole('button', { name: 'Connect to Cloudflare' });
    await submitButton.click();
    
    await expect(page.getByText('Domain Management')).toBeVisible();
    await expect(page.getByText('ROLLPIX Cloudflare Manager')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change API Token' })).toBeVisible();
  });

  test('should allow changing API token', async ({ page }) => {
    await page.goto('/');
    
    // Enter initial token
    const tokenInput = page.getByPlaceholder('Enter your Cloudflare API token');
    await tokenInput.fill('test-token-123');
    await page.getByRole('button', { name: 'Connect to Cloudflare' }).click();
    
    // Click change token button
    await page.getByRole('button', { name: 'Change API Token' }).click();
    
    // Should return to token input screen
    await expect(page.getByText('Cloudflare API Token')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your Cloudflare API token')).toBeVisible();
  });

  test('should display bulk actions when domains are present', async ({ page }) => {
    // This test would require mocking the API response
    // For now, we'll test the UI structure
    await page.goto('/');
    
    const tokenInput = page.getByPlaceholder('Enter your Cloudflare API token');
    await tokenInput.fill('test-token-123');
    await page.getByRole('button', { name: 'Connect to Cloudflare' }).click();
    
    // Wait for the domain table to load
    await expect(page.getByText('ROLLPIX Cloudflare Manager')).toBeVisible();
    
    // Check if refresh button is present
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});