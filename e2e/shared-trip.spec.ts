import { expect, test, type Page } from '@playwright/test';

// NOTE: written but NOT run by the author. Needs the build served by `vite preview` with a fake Supabase URL (see playwright.config.ts).
// The owner's share sheet (needs a signed-in session + the whole trip page) is NOT covered here: test it by hand (see the Part 7.8b checklist).
const TOKEN = 'abcdef01-2345-4678-89ab-cdef01234567';
const PLACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const sample = (over: Record<string, unknown> = {}) => ({
  version: 1, title: 'ทริปชลบุรี 2 คืน', sharer: 'เบนซ์', message: 'ดูแผนได้เลยนะ\nแก้ได้ทุกเมื่อ', expires_at: '2030-12-18T10:00:00+00:00', mode: 'car', road_factor: 1.3,
  day_end_time: '20:00', start_date: '2030-05-01', end_date: '2030-05-03', day_count: 3,
  provinces: [{ name_th: 'ชลบุรี', slug: 'chon-buri' }],
  days: [
    { day_index: 1, date: '2030-05-01', is_rest_day: false, start_time: '07:30', items: [
      { kind: 'place', title: 'ชายหาดสาธารณะ', place_id: PLACE, category_id: CAT, lat: 12.7, lng: 100.9, opening_hours_text: 'Tu-Su 09:00-16:00', duration_min: 90, locked_start: null },
      { kind: 'meal', title: 'มื้ออาหาร', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 60, locked_start: null },
    ] },
    { day_index: 2, date: '2030-05-02', is_rest_day: false, start_time: '07:00', items: [
      { kind: 'lodging', title: 'ที่พัก', place_id: null, category_id: null, lat: null, lng: null, opening_hours_text: null, duration_min: 30, locked_start: null },
    ] },
    { day_index: 3, date: '2030-05-03', is_rest_day: true, start_time: '07:00', items: [] },
  ],
  ...over,
});

type Mode = { body: unknown; status?: number };
async function mockApi(page: Page, replies: Mode[]) {
  const calls: Record<string, unknown>[] = [];
  let n = 0;
  await page.route(/127\.0\.0\.1:54321\/rest\/v1\//, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'get_shared_trip') {
      calls.push(route.request().postDataJSON() as Record<string, unknown>);
      const r = replies[Math.min(n++, replies.length - 1)];
      return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.body) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: '[]' });
  });
  return calls;
}

test.describe('หน้าผู้ดู #/s/<token> (มือถือ)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('เปิดลิงก์ที่ถูกต้อง: เห็นชื่อ ผู้แชร์ ข้อความ จังหวัด วัน และเวลา — โดยไม่ต้อง Login ไม่มีเมนูของแอป', async ({ page }) => {
    const calls = await mockApi(page, [{ body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'ทริปชลบุรี 2 คืน', level: 1 })).toBeAttached();
    await expect(page.getByText('เบนซ์')).toBeVisible();
    await expect(page.getByText('ดูแผนได้เลยนะ')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ชลบุรี' })).toHaveAttribute('href', /province\/chon-buri/);
    await expect(page.getByRole('tab', { name: /วัน 1/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: 'ชายหาดสาธารณะ' })).toHaveAttribute('href', new RegExp(`place/${PLACE}`));
    await expect(page.getByText('อ่านอย่างเดียว').first()).toBeVisible();
    await expect(page.locator('nav.fixed.bottom-0')).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    expect(calls).toEqual([{ p_token: TOKEN }]);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('เวลา: กิจกรรมแรกรอเปิด 09:00 (พุธ) และสลับวัน/วันพักได้', async ({ page }) => {
    await mockApi(page, [{ body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('09:00').first()).toBeVisible();
    await page.getByRole('tab', { name: /วัน 3/ }).click();
    await expect(page.getByText('วันพัก').first()).toBeVisible();
    await page.getByRole('tab', { name: /วัน 2/ }).click();
    await expect(page.getByText('ที่พัก', { exact: true })).toBeVisible();
  });

  test('ไม่ให้เสิร์ชเอนจินเก็บ และไม่ส่ง Referer', async ({ page }) => {
    await mockApi(page, [{ body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', 'noindex,nofollow');
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await page.goto('/#/');
    // noindex ของทั้งเว็บ (index.html) ยังอยู่ แต่ meta ที่หน้าแชร์เพิ่มเองถูกถอดเมื่อออกจากหน้านี้
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
    await expect(page.locator('meta[name="referrer"]')).toHaveCount(0);
  });

  test('ซ่อนวันที่: แสดงเป็นจำนวนวัน ไม่มีวันที่', async ({ page }) => {
    const hidden = sample({ start_date: null, end_date: null });
    (hidden.days as { date: string | null }[]).forEach((d) => { d.date = null; });
    await mockApi(page, [{ body: hidden }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText(/3 วัน/).first()).toBeVisible();
    await expect(page.getByText('2573')).toHaveCount(0);
  });

  test('ลิงก์ที่ใช้ไม่ได้ (ไม่พบ/หมดอายุ/ถูกปิด = null) ขึ้นข้อความเดียวกันหมด', async ({ page }) => {
    await mockApi(page, [{ body: null }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('ลิงก์นี้ใช้ไม่ได้แล้ว')).toBeVisible();
    await expect(page.getByText(/ถูกปิดโดยผู้แชร์ หมดอายุ หรือพิมพ์ไม่ครบ/)).toBeVisible();
  });

  test('token ที่ไม่ใช่ UUID: ขึ้นข้อความเดียวกัน และไม่ยิงคำขอไปที่เซิร์ฟเวอร์เลย', async ({ page }) => {
    const calls = await mockApi(page, [{ body: sample() }]);
    for (const bad of ['abc', "'%3B%20drop%20table", `${TOKEN}x`]) {
      await page.goto(`/#/s/${bad}`);
      await expect(page.getByText('ลิงก์นี้ใช้ไม่ได้แล้ว')).toBeVisible();
    }
    expect(calls).toHaveLength(0);
  });

  test('เซิร์ฟเวอร์ผิดพลาด: ขึ้น "โหลดไม่สำเร็จ" กดลองใหม่แล้วสำเร็จ', async ({ page }) => {
    await mockApi(page, [{ body: { code: 'XX000', message: 'boom' }, status: 500 }, { body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('โหลดทริปไม่สำเร็จ')).toBeVisible();
    await page.getByRole('button', { name: 'ลองใหม่' }).click();
    await expect(page.getByRole('heading', { name: 'ทริปชลบุรี 2 คืน', level: 1 })).toBeAttached();
  });

  test('ข้อมูลเกินกว่าที่รองรับ/รูปแบบเพี้ยน ไม่ทำให้หน้าพัง', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockApi(page, [{ body: { version: 1, title: 'x', days: [null, 5, { day_index: 'a' }] } }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('ทริปนี้ยังไม่มีแผนรายวัน')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('ชื่อทริปที่มี HTML ไม่ถูกตีความ', async ({ page }) => {
    await mockApi(page, [{ body: sample({ title: '<img src=x onerror=alert(1)>', message: '<b>ตัวหนา</b>' }) }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('<b>ตัวหนา</b>')).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test('ปุ่ม "สร้างแผนทริปของคุณเอง" พาไปหน้าแรกของแอป', async ({ page }) => {
    await mockApi(page, [{ body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await page.getByRole('link', { name: 'สร้างแผนทริปของคุณเอง' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});

test.describe('หน้าผู้ดู (คอมพิวเตอร์)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('เนื้อหาอยู่กลางจอ ไม่ล้น', async ({ page }) => {
    await mockApi(page, [{ body: sample() }]);
    await page.goto(`/#/s/${TOKEN}`);
    await expect(page.getByText('เบนซ์')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
