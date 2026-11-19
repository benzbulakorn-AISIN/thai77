import { expect, test, type Page, type Route } from '@playwright/test';

// Fake Supabase: provinces/categories + the search_places function. No real backend needed.
const PROV = [{ id: '11111111-1111-4111-8111-111111111111', pcode: 'TH20', slug: 'chon-buri', name_th: 'ชลบุรี', name_en: 'Chon Buri', region_id: 'r1' }];
const CATS = [{ id: '22222222-2222-4222-8222-222222222222', slug: 'temple', name_th: 'วัดและศาสนสถาน', icon: 'Landmark', color: '#B8860B', sort_order: 1, is_active: true }];
const row = (i: number, total: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name_th: `วัดทดสอบ ${i}`, name_en: null, province_id: PROV[0].id,
  district_id: null, district_name: 'เมืองชลบุรี', category_id: CATS[0].id, short_description: 'คำอธิบายสั้น', lat: null, lng: null,
  verification: 'pending', is_demo: true, popularity: 0, rank: 1, total,
});

type Opts = { total?: number; fail?: boolean };
async function mockApi(page: Page, o: Opts = {}) {
  const calls: Record<string, unknown>[] = [];
  await page.route(/127\.0\.0\.1:54321\/rest\/v1\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').pop();
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: JSON.stringify(body) });
    if (name === 'search_places') {
      const args = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(args);
      if (o.fail) return send({ code: 'XX000', message: 'boom' }, 500);
      const total = o.total ?? 45;
      const offset = Number(args.p_offset ?? 0);
      const n = Math.max(0, Math.min(Number(args.p_limit ?? 20), total - offset));
      return send(Array.from({ length: n }, (_, k) => row(offset + k + 1, total)));
    }
    if (name === 'provinces') return send(PROV);
    if (name === 'categories') return send(CATS);
    if (name === 'regions') return send([{ id: 'r1', code: 'east', name_th: 'ภาคตะวันออก', sort_order: 4 }]);
    return send([]);
  });
  return calls;
}

test.describe('ค้นหา (มือถือ)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('เข้าจากไอคอนแว่นขยายที่แถบบน และเห็นตัวช่วยตอนยังไม่พิมพ์', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/');
    await page.getByRole('link', { name: 'ค้นหา' }).click();
    await expect(page).toHaveURL(/#\/search/);
    await expect(page.getByRole('searchbox', { name: 'ค้นหาสถานที่' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ชลบุรี วัด' })).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('พิมพ์แล้วค้นอัตโนมัติ เห็นจำนวนและคำที่ตรงถูกเน้น', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/#/search');
    await page.getByRole('searchbox', { name: 'ค้นหาสถานที่' }).fill('วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await expect(page.locator('mark').first()).toHaveText('วัดทดสอบ');
    await expect(page).toHaveURL(/q=/);
    expect(calls[calls.length - 1]).toMatchObject({ p_q: 'วัดทดสอบ', p_limit: 20, p_offset: 0 });
  });

  test('พิมพ์ "จังหวัดชลบุรี วัด" ระบบตัดคำนำหน้าก่อนส่ง', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill('จังหวัดชลบุรี วัด');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    expect(calls[calls.length - 1]).toMatchObject({ p_q: 'ชลบุรี วัด' });
  });

  test('พิมพ์สั้นเกินไปแจ้งให้พิมพ์เพิ่ม และยังไม่ยิงค้นหา', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill('ก');
    await expect(page.getByText(/พิมพ์อย่างน้อย 2 ตัวอักษร/)).toBeVisible();
    await page.waitForTimeout(600);
    expect(calls).toHaveLength(0);
  });

  test('แบ่งหน้า: ถัดไป → หน้า 2/3 และกลับ', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ');
    await expect(page.getByText('หน้า 1/3')).toBeVisible();
    await expect(page.getByRole('button', { name: /ก่อนหน้า/ })).toBeDisabled();
    await page.getByRole('button', { name: /ถัดไป/ }).click();
    await expect(page.getByText('หน้า 2/3')).toBeVisible();
    await expect(page).toHaveURL(/p=2/);
    expect(calls[calls.length - 1]).toMatchObject({ p_offset: 20 });
    await page.getByRole('button', { name: /ถัดไป/ }).click();
    await expect(page.getByText('หน้า 3/3')).toBeVisible();
    await expect(page.getByRole('button', { name: /ถัดไป/ })).toBeDisabled();
    await page.getByRole('button', { name: /ก่อนหน้า/ }).click();
    await expect(page.getByText('หน้า 2/3')).toBeVisible();
  });

  test('เปิดลิงก์ที่มี ?q= แล้วค้นให้เลย และ Refresh แล้วผลเดิมกลับมา', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ&p=2');
    await expect(page.getByText('หน้า 2/3')).toBeVisible();
    await page.reload();
    await expect(page.getByText('หน้า 2/3')).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveValue('วัดทดสอบ');
  });

  test('ไม่พบ: แสดงข้อความและข้อแนะนำ', async ({ page }) => {
    await mockApi(page, { total: 0 });
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill('คำที่ไม่มี');
    await expect(page.getByText(/ไม่พบ “คำที่ไม่มี”/)).toBeVisible();
  });

  test('ผิดพลาด: แสดงข้อความ และกดลองใหม่ได้', async ({ page }) => {
    await mockApi(page, { fail: true });
    await page.goto('/#/search?q=วัดทดสอบ');
    await expect(page.getByText('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ลองใหม่' })).toBeVisible();
  });

  test('ล้างคำค้นด้วยปุ่มกากบาทและแป้น Esc', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await page.getByRole('button', { name: 'ล้างคำค้น' }).click();
    await expect(page.getByRole('searchbox')).toHaveValue('');
    await expect(page.getByText(/พบ 45 แห่ง/)).toHaveCount(0);
    await page.getByRole('searchbox').fill('วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await page.getByRole('searchbox').press('Escape');
    await expect(page.getByRole('searchbox')).toHaveValue('');
  });

  test('คำค้นล่าสุดถูกจำไว้ และกดเพื่อค้นซ้ำได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill('วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill('');
    await expect(page.getByRole('button', { name: 'วัดทดสอบ', exact: true })).toBeVisible();
  });

  test('ตัวกรองจังหวัด/หมวดส่งไปกับคำค้น และล้างได้', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await page.getByLabel('จังหวัด').selectOption({ label: 'ชลบุรี' });
    await expect.poll(() => calls[calls.length - 1]?.p_province).toBe(PROV[0].id);
    await expect(page.getByRole('button', { name: 'ล้างตัวกรอง' })).toBeVisible();
    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
    await expect.poll(() => calls[calls.length - 1]?.p_province).toBeNull();
  });

  test('ผลค้นหากดไปหน้าสถานที่ได้', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ');
    await page.getByRole('link', { name: /วัดทดสอบ 1/ }).first().click();
    await expect(page).toHaveURL(/#\/place\//);
  });

  test('พิมพ์ HTML / SQL ในช่องค้นหา ไม่ทำให้หน้าพังและไม่ถูกตีความ', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockApi(page, { total: 0 });
    await page.goto('/#/search');
    await page.getByRole('searchbox').fill(`<img src=x onerror=alert(1)> '; drop table places; --`);
    await expect(page.getByText(/ไม่พบ/)).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('ค้นหา (คอมพิวเตอร์)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ไอคอนค้นหาอยู่ที่แถบบน และหน้าไม่ล้นจอ', async ({ page }) => {
    await mockApi(page);
    await page.goto('/#/search?q=วัดทดสอบ');
    await expect(page.getByText(/พบ 45 แห่ง/)).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'ค้นหา' })).toHaveAttribute('aria-current', 'page');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
