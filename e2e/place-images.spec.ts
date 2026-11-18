import { expect, test, type Page } from '@playwright/test';

// Fake Supabase (REST) for one place with one Wikimedia picture. The picture itself is a 1x1 PNG served by the test.
const PLACE_ID = '11111111-1111-4111-8111-111111111111';
const IMG_ID = '22222222-2222-4222-8222-222222222222';
const WIKI_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/960px-Test.jpg';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const PLACE = {
  id: PLACE_ID, name_th: 'วัดทดสอบ', name_en: 'Test Temple', province_id: 'p1', district_id: null, category_id: 'c1',
  short_description: 'วัดสำหรับทดสอบ', highlights: [], lat: null, lng: null, address: null, opening_hours_text: null, closed_days_text: null,
  fee_thai: null, fee_foreigner: null, parking_fee: null, est_cost_per_person: null, suggested_minutes: null, best_time_of_day: null,
  best_months: [], phone: null, website_url: null, social_url: null, google_maps_url: null, popularity: 0, state: 'active',
  verification: 'pending', verified_at: null, is_demo: true,
};
const IMAGE = {
  id: IMG_ID, place_id: PLACE_ID, storage_path: null, external_url: WIKI_URL, license: 'CC BY-SA 4.0', author: 'Somchai',
  source_url: 'https://commons.wikimedia.org/wiki/File:Test.jpg', alt_th: 'ภาพวัดทดสอบตอนเช้า', sort_order: 0,
};

async function mockApi(page: Page, o: { withImage: boolean }) {
  await page.route(/127\.0\.0\.1:54321\/rest\/v1\/([a-z_]+)/, (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const one = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: JSON.stringify(body) });
    switch (table) {
      case 'places': return url.searchParams.get('select') === 'cover_image_id'
        ? send(one ? { cover_image_id: o.withImage ? IMG_ID : null } : [])
        : send(one ? PLACE : [PLACE]);
      case 'place_images': return send(o.withImage ? [IMAGE] : []);
      case 'categories': return send([{ id: 'c1', slug: 'temple', name_th: 'วัดและศาสนสถาน', icon: 'Landmark', color: '#B8860B', sort_order: 1, is_active: true }]);
      case 'provinces': return send([{ id: 'p1', pcode: 'TH50', slug: 'chiang-mai', name_th: 'เชียงใหม่', name_en: 'Chiang Mai', region_id: 'r1', best_season: null, summary: null }]);
      case 'regions': return send([{ id: 'r1', code: 'north', name_th: 'ภาคเหนือ', sort_order: 1 }]);
      case 'place_facilities': return send(one ? { has_toilet: null, has_parking: null, elderly_friendly: null, wheelchair: null, kid_friendly: null, pet_friendly: null } : []);
      case 'districts': return send(one ? { name_th: 'เมืองเชียงใหม่' } : []);
      default: return send([]);
    }
  });
}

test.describe('หน้าสถานที่: รูปปกและเครดิต', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('มีรูป: แสดงรูป alt ภาษาไทย เครดิต และไม่ล้นจอ', async ({ page }) => {
    await mockApi(page, { withImage: true });
    await page.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.goto(`/#/place/${PLACE_ID}`);
    await expect(page.getByRole('img', { name: 'ภาพวัดทดสอบตอนเช้า' })).toBeVisible();
    await expect(page.getByText('ภาพ: Somchai · CC BY-SA 4.0')).toBeVisible();
    await expect(page.getByRole('link', { name: /Somchai/ })).toHaveAttribute('href', /commons\.wikimedia\.org/);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('รูปโหลดไม่ได้: แสดงภาพปกอัตโนมัติพร้อมป้าย "ภาพประกอบ" แทน', async ({ page }) => {
    await mockApi(page, { withImage: true });
    await page.route('https://upload.wikimedia.org/**', (r) => r.abort());
    await page.goto(`/#/place/${PLACE_ID}`);
    await expect(page.getByText('ภาพประกอบ').first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'ภาพวัดทดสอบตอนเช้า' })).toHaveCount(0);
  });

  test('ไม่มีรูป: แสดงภาพปกอัตโนมัติ ป้ายภาพประกอบ และบอกว่าไม่ใช่รูปจริง', async ({ page }) => {
    await mockApi(page, { withImage: false });
    await page.goto(`/#/place/${PLACE_ID}`);
    await expect(page.getByText('ภาพประกอบ').first()).toBeVisible();
    await expect(page.getByText(/ไม่ใช่รูปจริงของสถานที่/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'จัดการรูป' })).toHaveCount(0); // ผู้เยี่ยมชมไม่เห็นปุ่มของ Admin
  });
});

test.describe('หน้าจัดการรูป (Admin)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ผู้ที่ไม่ใช่ Admin เข้าไม่ได้', async ({ page }) => {
    await mockApi(page, { withImage: false });
    await page.goto(`/#/admin/places/${PLACE_ID}/images`);
    await expect(page.getByText('สำหรับ Admin เท่านั้น')).toBeVisible();
  });
});
