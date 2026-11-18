import { expect, test, type Page } from '@playwright/test';

// The app talks to Supabase; for layout tests we answer every API call with an empty list so no real backend is needed.
const SUPABASE = /127\.0\.0\.1:54321/;
async function mockApi(page: Page) {
  await page.route(SUPABASE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
}

const VIEWPORTS = [
  { name: 'มือถือเล็ก 360×640', width: 360, height: 640 },
  { name: 'iPhone 390×844', width: 390, height: 844 },
  { name: 'แท็บเล็ต 768×1024', width: 768, height: 1024 },
  { name: 'เดสก์ท็อป 1280×800', width: 1280, height: 800 },
];
const ROUTES = [
  '/#/', '/#/explore', '/#/trips', '/#/memories', '/#/cart', '/#/profile', '/#/backup',
  '/#/auth/login', '/#/place/00000000-0000-0000-0000-000000000000', '/#/no-such-page',
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`ไม่มี horizontal scroll และไม่มี JS error: ${route}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await mockApi(page);
        await page.goto(route);
        await page.locator('main').waitFor();
        await page.waitForTimeout(500);
        const over = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth - window.innerWidth,
          body: document.body.scrollWidth - window.innerWidth,
        }));
        expect(over.doc, 'หน้าเว็บกว้างเกินจอ').toBeLessThanOrEqual(1);
        expect(over.body).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      });
    }

    if (vp.width < 1024) {
      test('เมนูล่างมี 5 ปุ่ม แตะง่าย และเมนูข้างซ่อนอยู่', async ({ page }) => {
        await mockApi(page);
        await page.goto('/#/');
        const links = page.locator('nav.fixed.bottom-0 a');
        await expect(links).toHaveCount(5);
        await expect(links).toHaveText([/หน้าแรก/, /สำรวจ/, /ทริป/, /ความทรงจำ/, /โปรไฟล์/]);
        for (let i = 0; i < 5; i++) {
          const box = await links.nth(i).boundingBox();
          expect(box?.height ?? 0, `ปุ่มเมนูที่ ${i + 1} เตี้ยเกินไป`).toBeGreaterThanOrEqual(56);
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(vp.width / 5 - 2);
        }
        await expect(page.locator('aside')).toBeHidden();
      });

      test('ฟอร์มเข้าสู่ระบบใช้งานบนมือถือได้ (ช่องกรอก ≥16px กันเบราว์เซอร์ซูม, ปุ่ม ≥44px)', async ({ page }) => {
        await mockApi(page);
        await page.goto('/#/auth/login');
        const input = page.locator('input[type="email"]');
        await expect(input).toBeVisible();
        const fs = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(fs).toBeGreaterThanOrEqual(16);
        const btn = page.getByRole('button', { name: 'เข้าสู่ระบบ' });
        const box = await btn.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vp.width);
      });
    } else {
      test('เดสก์ท็อป: เมนูข้างแสดง เมนูล่างซ่อน', async ({ page }) => {
        await mockApi(page);
        await page.goto('/#/');
        await expect(page.locator('aside')).toBeVisible();
        await expect(page.locator('nav.fixed.bottom-0')).toBeHidden();
      });
    }
  });
}

test.describe('การใช้งานทั่วไป', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Refresh หน้า Route ย่อยแล้วไม่ 404 (HashRouter)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/profile');
    await expect(page.getByRole('heading', { name: 'ธีม' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ธีม' })).toBeVisible();
  });

  test('เปลี่ยนธีมแล้วจำค่าไว้หลัง Refresh', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Sakura Pink' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
  });

  test('โหมดมืดใช้งานได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'มืด' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('ตะกร้าว่างแสดงข้อความช่วยเหลือ และ Title ของแอปถูกต้อง', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/cart');
    await expect(page.getByText('ตะกร้าว่าง')).toBeVisible();
    await expect(page).toHaveTitle(/เที่ยวไทย 77/);
  });

  test('หน้าที่ต้อง Login แสดงปุ่มเข้าสู่ระบบ (ไม่ใช่หน้าว่าง)', async ({ page }) => {
    await mockApi(page);
    for (const r of ['/#/trips', '/#/memories', '/#/backup']) {
      await page.goto(r);
      await expect(page.getByRole('link', { name: /เข้าสู่ระบบ/ }).first()).toBeVisible();
    }
  });
});
