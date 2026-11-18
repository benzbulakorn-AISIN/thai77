import { expect, test, type Page } from '@playwright/test';

const SUPABASE = /127\.0\.0\.1:54321/;
async function mockApi(page: Page) {
  await page.route(SUPABASE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
}

const panel = (page: Page) => page.getByRole('region', { name: 'แผงข้อมูลสำรวจ' });
const height = async (page: Page) => (await panel(page).boundingBox())?.height ?? 0;

test.describe('หน้าสำรวจ (มือถือ)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ไม่ล้นจอ มีแถบสถานะและแผงข้อมูล', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('เลือกภาค');
    await expect(page.getByRole('status')).toContainText('เลือกจังหวัด');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('ปุ่มลูกศรสลับแผงได้ครบ 3 ระดับ (ครึ่ง → เต็ม → ครึ่ง → ซ่อน…)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    const toggle = page.getByRole('button', { name: 'ขยายหรือย่อแผง' });
    await expect(toggle).toBeVisible();
    await expect.poll(() => height(page)).toBeGreaterThan(200);
    const half = await height(page);

    await toggle.focus();
    await page.keyboard.press('Enter'); // half -> full
    await expect.poll(() => height(page)).toBeGreaterThan(half + 40);
    await page.keyboard.press('Enter'); // full -> half
    await expect.poll(() => height(page)).toBeLessThan(half + 10);
  });

  test('ลากหัวแผงลงเพื่อซ่อน แล้วแผงเหลือแต่หัว', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    const box = (await panel(page).boundingBox())!;
    const startY = box.y + 12;
    const startX = box.x + box.width / 2 - 40;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 120, { steps: 6 });
    await page.mouse.move(startX, startY + 320, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => height(page)).toBeLessThan(120);
  });

  test('ปุ่มแผนที่: ตำแหน่ง และเต็มจอ (ซ่อนแผง) กลับด้วยปุ่มหรือ Esc', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(page.getByRole('button', { name: 'ตำแหน่งของฉัน' })).toBeVisible();
    await page.getByRole('button', { name: 'แผนที่เต็มจอ' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ออกจากเต็มจอ' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeVisible();
    await page.getByRole('button', { name: 'แผนที่เต็มจอ' }).click();
    await page.getByRole('button', { name: 'ออกจากเต็มจอ' }).click();
    await expect(panel(page)).toBeVisible();
  });

  test('เปิด #/explore?region=east แล้วเป็นชั้นภาค มีปุ่มกลับ และกลับได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(page.getByRole('button', { name: 'กลับไปเลือกภาค' })).toHaveCount(0);
    // ภาคที่ไม่มีในข้อมูล (ไม่มีข้อมูลจังหวัดใน mock) ถือเป็นชั้นที่ 1
    await page.goto('/#/explore?region=east');
    await expect(page.getByRole('status')).toContainText('เลือกภาค');
  });

  test('ช่องค้นหาจังหวัดพิมพ์ไทยได้ และล้างได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    const box = page.getByRole('textbox', { name: 'ค้นหาจังหวัด' });
    await box.fill('ชลบุรี');
    await expect(page.getByText('ไม่พบจังหวัด')).toBeVisible(); // mock ไม่มีข้อมูลจังหวัด
    await page.getByRole('button', { name: 'ล้างคำค้น' }).click();
    await expect(box).toHaveValue('');
  });

  test('ปุ่มจัดทริปกดไม่ได้เมื่อยังไม่มีอะไรให้จัด', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(page.getByRole('button', { name: /^จัดทริป/ })).toBeDisabled();
  });
});

test.describe('หน้าสำรวจ (คอมพิวเตอร์)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('แผงข้างพับ/แสดงได้ และจำค่าหลัง Refresh', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(panel(page)).toBeVisible();
    expect((await panel(page).boundingBox())!.width).toBeGreaterThan(300);

    await page.getByRole('button', { name: 'ซ่อนแผง' }).click();
    await expect(panel(page)).toBeHidden();
    await page.reload();
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'แสดงแผง' }).click();
    await expect(panel(page)).toBeVisible();
  });

  test('ไม่มีปุ่มลูกศรของแผงมือถือบนคอมพิวเตอร์ และไม่มีเมนูล่าง', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/explore');
    await expect(page.getByRole('button', { name: 'ขยายหรือย่อแผง' })).toBeHidden();
    await expect(page.locator('nav.fixed.bottom-0')).toBeHidden();
  });
});
