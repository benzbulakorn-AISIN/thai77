import { expect, test, type Page } from '@playwright/test';

const SUPABASE = /127\.0\.0\.1:54321/;
async function mockApi(page: Page) {
  await page.route(SUPABASE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
}

test.describe('หน้าแรก (ผู้เยี่ยมชม)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('แสดงคำทักทาย ความคืบหน้า 0/77 และปุ่มเริ่มสำรวจที่พาไปหน้าสำรวจ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible();
    await expect(page.getByText(/0\/77/)).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
    await page.getByRole('link', { name: /เริ่มสำรวจ/ }).click();
    await expect(page).toHaveURL(/#\/explore/);
  });

  test('มีปุ่มหลักเพียงปุ่มเดียว และผู้เยี่ยมชมเห็นปุ่มเข้าสู่ระบบ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    await expect(page.getByRole('link', { name: /เริ่มสำรวจ/ })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /เข้าสู่ระบบ/ }).first()).toBeVisible();
  });

  test('ทางลัด 4 อัน พาไปหน้าตะกร้าได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    const tiles = page.getByRole('region', { name: 'ทางลัด' }).getByRole('link');
    await expect(tiles).toHaveCount(4);
    await page.getByRole('link', { name: /ตะกร้าทริป/ }).click();
    await expect(page).toHaveURL(/#\/cart/);
  });
});

test.describe('หน้าเข้าสู่ระบบ', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('มีภาพ ชิปประโยชน์ และไม่ล้นจอ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/auth/login');
    for (const t of ['ซิงก์ข้ามเครื่อง', 'รูปเป็นส่วนตัว', 'วางแผนร่วมกัน']) await expect(page.getByText(t)).toBeVisible();
    await expect(page.locator('svg[role="presentation"], img[alt*="ภาพประกอบ"]').first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('กดปุ่มรูปตาค้างเพื่อดูรหัสผ่าน ปล่อยแล้วซ่อน', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/auth/login');
    const input = page.locator('input[autocomplete="current-password"]');
    const reveal = page.getByRole('button', { name: /แสดงรหัสผ่าน/ });
    await input.fill('abc12345');
    await expect(input).toHaveAttribute('type', 'password');
    await reveal.hover();
    await page.mouse.down();
    await expect(input).toHaveAttribute('type', 'text');
    await page.mouse.up();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('ปุ่มแสดงรหัสผ่านแตะง่าย (≥44px) และปุ่มเข้าสู่ระบบยังเป็นปุ่มเดียว', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/auth/login');
    const box = await page.getByRole('button', { name: /แสดงรหัสผ่าน/ }).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toHaveCount(1);
  });

  test('ใช้แบบผู้เยี่ยมชม พากลับหน้าแรก', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/auth/login');
    await page.getByRole('button', { name: /ใช้แบบผู้เยี่ยมชม/ }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});

test.describe('หน้าสำรวจ: ปักหมุดและเลย์เอาต์คอมพิวเตอร์', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ผู้เยี่ยมชมกดปักหมุดเอง แล้วถูกพาไปเข้าสู่ระบบ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await page.getByRole('button', { name: 'ปักหมุดเอง' }).click();
    await expect(page).toHaveURL(/#\/auth\/login/);
  });

  test('คอมพิวเตอร์: แถบสถานะไม่ทับแผงด้านขวา (แก้บั๊กที่เจอจากภาพหน้าจอ)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page);
    await page.goto('/#/explore');
    const pill = await page.getByRole('status').boundingBox();
    const panel = await page.getByRole('region', { name: 'แผงข้อมูลสำรวจ' }).boundingBox();
    expect(pill).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(panel!.x + 1);
    // หัวข้อของแผงต้องมองเห็น ไม่ถูกแถบสถานะบัง
    await expect(page.getByRole('heading', { name: 'เลือกภาค' })).toBeVisible();
  });
});
