import { expect, test, type Page } from '@playwright/test';

// NOTE: written but NOT run by the author. The fake Supabase and the fake signed-in session may need a small adjustment.
const GUEST_KEY = 'thai77.guest.places.v1';
const PLACE_ID = '11111111-1111-4111-8111-111111111111';
const UID = '99999999-9999-4999-8999-999999999999';
const PLACE = {
  id: PLACE_ID, name_th: 'วัดทดสอบ', name_en: null, province_id: 'p1', district_id: null, category_id: 'c1', short_description: 'วัดสำหรับทดสอบ',
  highlights: [], lat: 12.9, lng: 100.9, address: null, opening_hours_text: null, closed_days_text: null, fee_thai: null, fee_foreigner: null,
  parking_fee: null, est_cost_per_person: null, suggested_minutes: 60, best_time_of_day: null, best_months: [], phone: null, website_url: null,
  social_url: null, google_maps_url: null, popularity: 0, state: 'active', verification: 'pending', verified_at: null, is_demo: true,
};

type Calls = { statusUpserts: unknown[]; favoriteUpserts: unknown[] };

async function mockApi(page: Page, o: { signedIn?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { statusUpserts: [], favoriteUpserts: [] };
  const session = {
    access_token: 'e2e.fake.token', refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  if (o.signedIn) {
    await page.addInitScript((s) => localStorage.setItem('sb-127-auth-token', JSON.stringify(s)), session);
    await page.route(/127\.0\.0\.1:54321\/auth\/v1\/user/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
  }
  await page.route(/127\.0\.0\.1:54321\/rest\/v1\/([a-z_]+)/, (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop();
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: JSON.stringify(body) });
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      if (table === 'user_place_status') calls.statusUpserts.push(body);
      if (table === 'favorites') calls.favoriteUpserts.push(body);
      return send([], 201);
    }
    switch (table) {
      case 'places': return send(one ? PLACE : [PLACE]);
      case 'categories': return send([{ id: 'c1', slug: 'temple', name_th: 'วัดและศาสนสถาน', icon: 'Landmark', color: '#B8860B', sort_order: 1, is_active: true }]);
      case 'provinces': return send([{ id: 'p1', pcode: 'TH20', slug: 'chon-buri', name_th: 'ชลบุรี', name_en: 'Chon Buri', region_id: 'r1' }]);
      case 'regions': return send([{ id: 'r1', code: 'east', name_th: 'ภาคตะวันออก', sort_order: 4 }]);
      case 'profiles': return send(one ? { id: UID, display_name: 'ทดสอบ', role: 'user' } : []);
      case 'place_facilities': return send(one ? {} : []);
      default: return send([]);
    }
  });
  return calls;
}

const seed = (page: Page, items: Record<string, unknown>) =>
  page.addInitScript(([k, v]) => { if (!localStorage.getItem(k as string)) localStorage.setItem(k as string, v as string); }, [GUEST_KEY, JSON.stringify({ v: 1, items })]);
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), GUEST_KEY);

test.describe('Guest Mode: ผู้เยี่ยมชมบันทึกสถานะและโปรด', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('กด "อยากไป" ได้โดยไม่ต้อง Login ไม่ถูกพาไปหน้า Login และจำค่าหลัง Refresh', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#/place/${PLACE_ID}`);
    const want = page.getByRole('group', { name: 'สถานะ' }).getByRole('button', { name: /อยากไป/ });
    await want.click();
    await expect(want).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/#\/place\//);
    expect((await stored(page)).items[PLACE_ID]).toMatchObject({ s: 'want', f: false });
    await page.reload();
    await expect(page.getByRole('group', { name: 'สถานะ' }).getByRole('button', { name: /อยากไป/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('ครั้งแรกมีข้อความอธิบายว่าบันทึกไว้ในเครื่องนี้', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#/place/${PLACE_ID}`);
    await page.getByRole('group', { name: 'สถานะ' }).getByRole('button', { name: /ไปมาแล้ว/ }).click();
    await expect(page.getByText(/บันทึกไว้ในเครื่องนี้/).first()).toBeVisible();
  });

  test('กดหัวใจโปรดได้ และกดซ้ำเพื่อเอาออก (รายการว่างจะถูกลบจากเครื่อง)', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#/place/${PLACE_ID}`);
    await page.getByRole('button', { name: 'เพิ่มเป็นสถานที่โปรด' }).click();
    await expect(page.getByRole('button', { name: 'เอาออกจากโปรด' })).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).items[PLACE_ID]).toMatchObject({ s: null, f: true });
    await page.getByRole('button', { name: 'เอาออกจากโปรด' }).click();
    expect(await stored(page)).toBeNull();
  });

  test('"ยังไม่สนใจ" เอาสถานะออก', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#/place/${PLACE_ID}`);
    const group = page.getByRole('group', { name: 'สถานะ' });
    await group.getByRole('button', { name: /อยากไป/ }).click();
    await group.getByRole('button', { name: /ยังไม่สนใจ/ }).click();
    expect(await stored(page)).toBeNull();
  });

  test('หน้าสำรวจแสดงรายการ "ที่สนใจ" ของผู้เยี่ยมชม และเอาออกได้', async ({ page }) => {
    await mockApi(page);
    await seed(page, { [PLACE_ID]: { s: 'want', f: false, t: 1 } });
    await page.goto('/#/explore');
    await expect(page.getByRole('heading', { name: /ที่สนใจ \(1\)/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /วัดทดสอบ/ })).toBeVisible();
    await expect(page.getByText(/บันทึกไว้ในเครื่องนี้/).first()).toBeVisible();
    await page.getByRole('button', { name: /เอา วัดทดสอบ ออกจากที่สนใจ/ }).click();
    await expect(page.getByRole('heading', { name: /ที่สนใจ \(0\)/ })).toBeVisible();
    expect(await stored(page)).toBeNull();
  });

  test('ข้อมูลในเครื่องที่เสียหาย ไม่ทำให้เว็บพัง', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockApi(page);
    await page.addInitScript((k) => localStorage.setItem(k, '{{{ not json'), GUEST_KEY);
    await page.goto(`/#/place/${PLACE_ID}`);
    await expect(page.getByRole('group', { name: 'สถานะ' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('หน้าแรกของผู้เยี่ยมชม นับความคืบหน้าจากที่บันทึกไว้ในเครื่อง', async ({ page }) => {
    await mockApi(page);
    await seed(page, { [PLACE_ID]: { s: 'visited', f: false, t: 1 } });
    await page.goto('/#/');
    await expect(page.getByText(/นับจากที่บันทึกไว้ในเครื่องนี้/)).toBeVisible();
  });
});

test.describe('ย้ายข้อมูลขึ้นบัญชีหลัง Login', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('มีข้อมูลในเครื่อง + Login → ถามก่อนย้าย ไม่ย้ายเอง; "ไว้ทีหลัง" ปิดและไม่ถามซ้ำในแท็บนี้', async ({ page }) => {
    const calls = await mockApi(page, { signedIn: true });
    await seed(page, { [PLACE_ID]: { s: 'want', f: true, t: 1 } });
    await page.goto('/#/');
    await expect(page.getByRole('dialog', { name: 'ย้ายข้อมูลในเครื่องนี้ขึ้นบัญชี?' })).toBeVisible();
    await expect(page.getByText('e2e@example.com')).toBeVisible();
    expect(calls.statusUpserts).toHaveLength(0);
    await page.getByRole('button', { name: 'ไว้ทีหลัง' }).click();
    await expect(page.getByRole('dialog', { name: 'ย้ายข้อมูลในเครื่องนี้ขึ้นบัญชี?' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'ย้ายข้อมูลในเครื่องนี้ขึ้นบัญชี?' })).toHaveCount(0);
    expect(await stored(page)).not.toBeNull(); // nothing was deleted
  });

  test('กด "ย้ายขึ้นบัญชี" → เขียนสถานะและโปรดเข้าบัญชี แล้วลบจากเครื่อง', async ({ page }) => {
    const calls = await mockApi(page, { signedIn: true });
    await seed(page, { [PLACE_ID]: { s: 'want', f: true, t: 1 } });
    await page.goto('/#/');
    await page.getByRole('button', { name: 'ย้ายขึ้นบัญชี' }).click();
    await expect.poll(() => calls.statusUpserts.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls.statusUpserts[0])).toContain(PLACE_ID);
    expect(JSON.stringify(calls.statusUpserts[0])).toContain('"status":"want"');
    expect(JSON.stringify(calls.favoriteUpserts[0])).toContain(PLACE_ID);
    await expect.poll(async () => await stored(page), { timeout: 8000 }).toBeNull();
  });

  test('"ไม่ใช่ของฉัน" ต้องยืนยันก่อน และลบโดยไม่เขียนอะไรเข้าบัญชี', async ({ page }) => {
    const calls = await mockApi(page, { signedIn: true });
    await seed(page, { [PLACE_ID]: { s: 'want', f: false, t: 1 } });
    await page.goto('/#/');
    await page.getByRole('button', { name: /ไม่ใช่ของฉัน/ }).click();
    await expect(page.getByText('ลบข้อมูลในเครื่องนี้?')).toBeVisible();
    expect(await stored(page)).not.toBeNull();
    await page.getByRole('button', { name: 'ลบ', exact: true }).click();
    await expect.poll(() => stored(page)).toBeNull();
    expect(calls.statusUpserts).toHaveLength(0);
  });
});
