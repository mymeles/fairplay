import { expect, test } from '@playwright/test';

/**
 * Smoke spec: render the landing page, confirm the brand copy, and confirm
 * the two primary CTAs route to /host/login and /join. This catches the
 * "did the build produce empty pages" class of regression without any
 * external dependency.
 */
test.describe('Landing page', () => {
  test('renders brand copy and primary CTAs', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Vote the vibe/i })).toBeVisible();
    await expect(page.getByText(/aux cord, but fair/i)).toBeVisible();

    const hostCta = page.getByRole('link', { name: /Host a party/i });
    await expect(hostCta).toHaveAttribute('href', '/host/login');

    const joinCta = page.getByRole('link', { name: /Join a party/i });
    await expect(joinCta).toHaveAttribute('href', '/join');
  });

  test('host login page surfaces the Connect Spotify CTA', async ({ page }) => {
    await page.goto('/host/login');
    await expect(page.getByRole('heading', { name: /Connect your Spotify/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect Spotify/i })).toBeVisible();
  });

  test('join page accepts a code via the search param', async ({ page }) => {
    await page.goto('/join?code=ABC123');
    const input = page.getByLabel(/Party code/i);
    await expect(input).toHaveValue('ABC123');
    await expect(page.getByLabel(/Your name/i)).toBeVisible();
  });
});
