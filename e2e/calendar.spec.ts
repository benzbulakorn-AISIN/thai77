import { expect, test, type Page } from '@playwright/test';

// Fake Supabase for a signed-in user with two trips (one crosses a week boundary). No real backend needed.
// NOTE: written but not run by the author — the fake session format may need a small adjustment.
const SB = 'http://127.0.0.1:54321';
const UID = '99999999-9999-4999-8999-999999999999';
const TRIPS = [
  { id: 't1', name: 'เที่ยวชลบุรี', start_date: '2026-11-20', end_date: '2026-11-24', travelers: 2, mode: 'car', province_ids: [], owner_id: UID },
  { id: 't2', name: 'ทริปวันเดียว', start_date: '2026-11-25', end_date: '2026-11-25', travelers: 2, mode: 'car', province_ids: [], owner_id: UID },
];

async function signIn(page: Page) {
  const session = {
    access_token: 'e2e.fake.token', refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await page.addInitScript((s) => localStorage.setItem('sb-127-auth-token', JSON.stringify(s)), session);
  await page.route(/127\.0\.0\.1:54321\/auth\/v1\/user/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
  await page.route(/127\.0\.0\.1:54321\/rest\/v1\//, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const one = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const send = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: JSON.stringify(b) });
    if (name === 'trips') return send(one ? { ...TRIPS[0], vehicle_count: 1, day_start_time: '07:00:00', day_end_time: '20:00:00', road_factor: 1.3, start_point: null, end_point: null } : TRIPS);
    if (name === 'trip_days') return send([{ id: 'd1', trip_id: 't1', day_index: 1, date: '2026-11-20', start_time: null, is_rest_day: false }]);
    if (name === 'profiles') return send(one ? { id: UID, display_name: 'ทดสอบ', role: 'user' } : []);
    if (name === 'regions') return send([]);
    return send([]);
  });
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+07:00'));
}

test.describe('ปฏิทินทริป', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ผู้เยี่ยมชมเห็นปุ่มเข้าสู่ระบบ', async ({ page }) => {
    await page.route(/127\.0\.0\.1:54321/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/#/calendar');
    await expect(page.getByText('เข้าสู่ระบบเพื่อดูปฏิทินทริป')).toBeVisible();
  });

  test('แสดงเดือนปัจจุบัน (พ.ศ.) หัวตารางวันอาทิตย์ก่อน และไม่ล้นจอ', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar');
    await expect(page.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeVisible();
    const heads = page.locator('[role="group"] > div').first().locator('div');
    await expect(heads).toHaveText(['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('วันนี้ถูกทำเครื่องหมาย และทริปที่ข้ามสัปดาห์แสดงแถบต่อเนื่อง', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar');
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label', /19 พฤศจิกายน 2569/);
    await expect(page.getByLabel(/20 พฤศจิกายน 2569 · 1 ทริป: เที่ยวชลบุรี/)).toBeVisible();
    await expect(page.getByLabel(/22 พฤศจิกายน 2569 · 1 ทริป: เที่ยวชลบุรี/)).toBeVisible();
    await expect(page.getByLabel(/26 พฤศจิกายน 2569$/)).toBeVisible();
  });

  test('แตะวันที่มีทริป แล้วเห็นรายการ "วันที่ N/M" และลิงก์เปิดทริป', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar');
    await page.getByLabel(/21 พฤศจิกายน 2569/).click();
    await expect(page.getByText('วันที่ 2/5')).toBeVisible();
    await expect(page.getByRole('link', { name: 'เปิดทริป' }).first()).toHaveAttribute('href', /#\/trips\/t1|\/trips\/t1/);
    await expect(page).toHaveURL(/d=2026-11-21/);
  });

  test('เลื่อนเดือนไป-กลับ และปุ่มวันนี้ พร้อมจำเดือนใน URL', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar');
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(page.getByRole('heading', { name: 'ธันวาคม 2569' })).toBeVisible();
    await expect(page).toHaveURL(/m=2026-12/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ธันวาคม 2569' })).toBeVisible();
    await page.getByRole('button', { name: 'เดือนก่อนหน้า' }).click();
    await page.getByRole('button', { name: 'เดือนก่อนหน้า' }).click();
    await expect(page.getByRole('heading', { name: 'ตุลาคม 2569' })).toBeVisible();
    await page.getByRole('button', { name: 'วันนี้' }).click();
    await expect(page.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeVisible();
  });

  test('เปิดลิงก์ที่ค่าผิดปกติ ไม่พัง และใช้เดือนปัจจุบัน', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar?m=9999-99&d=<script>');
    await expect(page.getByRole('heading', { name: 'พฤศจิกายน 2569' })).toBeVisible();
  });

  test('ส่งออกทุกทริปเป็นไฟล์ .ics ที่อ่านได้', async ({ page }) => {
    await signIn(page);
    await page.goto('/#/calendar');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ส่งออกทุกทริป/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^thai77-.*\.ics$/);
    const path = await download.path();
    const text = (await import('node:fs')).readFileSync(path!, 'utf8');
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:เที่ยวชลบุรี');
    expect(text).toContain('DTSTART;VALUE=DATE:20261120');
    expect(text).toContain('DTEND;VALUE=DATE:20261125');
    expect(text.trim().endsWith('END:VCALENDAR')).toBe(true);
  });
});
