import { expect, test, type Page } from '@playwright/test';

const SUPABASE = /127\.0\.0\.1:54321/;
async function mockApi(page: Page) {
  await page.route(SUPABASE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
}

test.describe('เดสก์ท็อป: เมนูข้างพับได้', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('พับ/ขยายเมนู และจำค่าไว้หลัง Refresh', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? 0).toBeGreaterThan(200);

    await page.getByRole('button', { name: 'พับเมนู' }).click();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? 999).toBeLessThan(100);

    await page.reload();
    await expect(page.getByRole('button', { name: 'ขยายเมนู' })).toBeVisible();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? 999).toBeLessThan(100);

    await page.getByRole('button', { name: 'ขยายเมนู' }).click();
    await expect.poll(async () => (await aside.boundingBox())?.width ?? 0).toBeGreaterThan(200);
  });

  test('แถบบนมีสโลแกนและปุ่มโปรไฟล์', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    await expect(page.locator('header').getByText('เที่ยวให้ครบ 77 จังหวัด')).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'โปรไฟล์' })).toBeVisible();
  });
});

test.describe('มือถือ: ปุ่มทริปตรงกลางเด่น', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ปุ่มทริปยกขึ้นเหนือแถบเมนู และใหญ่พอแตะ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    const nav = await page.locator('nav.fixed.bottom-0').boundingBox();
    const circle = await page.getByTestId('nav-primary').boundingBox();
    expect(nav).not.toBeNull();
    expect(circle).not.toBeNull();
    expect(circle!.y).toBeLessThan(nav!.y);
    expect(circle!.width).toBeGreaterThanOrEqual(48);
    expect(circle!.height).toBeGreaterThanOrEqual(48);
  });

  test('แถบบนไม่ล้นจอ และกดปุ่มทริปไปหน้าทริปได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
    await page.getByRole('link', { name: 'ทริป' }).click();
    await expect(page).toHaveURL(/#\/trips/);
  });
});

test.describe('เปิดเว็บครั้งแรก', () => {
  test('มี Skeleton และธีมถูกตั้งก่อน React โหลด (ไม่กะพริบ)', async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem('thai77.theme', JSON.stringify({ theme: 'sakura', mode: 'dark' })));
    await page.route('**/assets/*.js', (r) => r.abort()); // จำลอง JS ยังโหลดไม่เสร็จ
    await page.goto('/#/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('#root .boot')).toBeVisible();
  });

  test('ค่าธีมที่ผิดปกติใน localStorage ถูกเมินและใช้ค่าเริ่มต้น', async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem('thai77.theme', JSON.stringify({ theme: '"><script>x</script>', mode: 'weird' })));
    await page.route('**/assets/*.js', (r) => r.abort());
    await page.goto('/#/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  });
});
