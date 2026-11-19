import { expect, test } from '@playwright/test';

// NOTE: written but NOT run by the author. Needs the site built (`npm run build`, which includes the PWA step) and served by `vite preview`.
// The app does not register its service worker under automation (navigator.webdriver), so these tests switch that flag off.
test.use({ serviceWorkers: 'allow' });

const asRealBrowser = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });

test.describe('ไฟล์ของเว็บแอป', () => {
  test('manifest โหลดได้ มีชื่อ ไอคอน และ scope ตรงกับ base ที่ build', async ({ request, baseURL }) => {
    const res = await request.get(new URL('manifest.webmanifest', baseURL).href);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe('standalone');
    expect(m.short_name).toBeTruthy();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const ic of m.icons) {
      const r = await request.get(new URL(ic.src, new URL('manifest.webmanifest', baseURL)).href);
      expect(r.ok(), ic.src).toBe(true);
    }
  });

  test('หน้าแรกมีแท็กติดตั้ง ภาพตัวอย่างลิงก์ และ noindex อยู่ใน HTML ที่เซิร์ฟเวอร์ส่งมา (ไม่ต้องรอ JavaScript)', async ({ request, baseURL }) => {
    const html = await (await request.get(baseURL!)).text();
    for (const needle of ['rel="manifest"', 'rel="apple-touch-icon"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"', 'name="robots" content="noindex,nofollow"', 'name="thai77-pwa" content="on"']) {
      expect(html, needle).toContain(needle);
    }
    expect(html).not.toMatch(/__thai77_site__|__OG_|__PWA_STATE__/);
  });

  test('build.json และ sw.js มี และเลขเวอร์ชันตรงกัน', async ({ request, baseURL }) => {
    const info = await (await request.get(new URL('build.json', baseURL).href)).json();
    const sw = await (await request.get(new URL('sw.js', baseURL).href)).text();
    expect(sw).toContain(`const BUILD_ID = '${info.id}';`);
  });
});

test.describe('Service Worker และโหมดออฟไลน์', () => {
  test('ลงทะเบียน → โหลดซ้ำจนคุมหน้า → ตัดอินเทอร์เน็ต → รีเฟรชแล้วแอปยังเปิดได้', async ({ page, context }) => {
    await asRealBrowser(page);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                                      // รอบนี้หน้าถูกคุมโดย Service Worker แล้ว
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.getByText('เที่ยวไทย 77').first()).toBeVisible();      // ส่วนหัวของแอปแสดงจากไฟล์ที่เก็บไว้
    await expect(page.getByText(/ออฟไลน์อยู่/)).toBeVisible();              // แถบ "ออฟไลน์" ที่มีอยู่แล้ว
    await context.setOffline(false);
  });

  test('Service Worker ไม่แตะคำขอไปเว็บอื่น: คำขอไป Supabase ยังผ่านเครื่องมือทดสอบได้ตามปกติ', async ({ page }) => {
    await asRealBrowser(page);
    let seen = 0;
    await page.route(/127\.0\.0\.1:54321/, (r) => { seen++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: '[]' }); });
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => seen).toBeGreaterThan(0);
  });

  test('หลังติดตั้งแล้ว ในแคชมีแต่ไฟล์ของแอป (ไม่มี API ไม่มี URL ของรูปส่วนตัว)', async ({ page }) => {
    await asRealBrowser(page);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const urls: string[] = await page.evaluate(async () => {
      const out: string[] = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
      return out;
    });
    expect(urls.length).toBeGreaterThan(3);
    expect(urls.every((u) => u.startsWith(location.origin))).toBe(true);
    expect(urls.some((u) => /supabase|token=|memory-photos|openstreetmap/i.test(u))).toBe(false);
  });

  test('หน้า #/install: การ์ดติดตั้งแอป แสดงเวอร์ชัน และปุ่มล้างแคชต้องยืนยันก่อน', async ({ page }) => {
    await asRealBrowser(page);
    await page.route(/127\.0\.0\.1:54321/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: '[]' }));
    await page.goto('/#/install');
    await expect(page.getByRole('region', { name: 'ติดตั้งแอป' })).toBeVisible();
    await expect(page.getByText(/เวอร์ชัน:/)).toBeVisible();
    await page.getByRole('button', { name: /ล้างแคชของแอป/ }).click();
    await expect(page.getByText('ล้างแคชของแอป?')).toBeVisible();
    await expect(page.getByText(/ไม่ลบข้อมูลของคุณ/)).toBeVisible();
  });
});

test.describe('มือถือ: หน้า #/install ไม่ล้นจอ', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('การ์ดติดตั้งแอปพอดีจอ', async ({ page }) => {
    await page.route(/127\.0\.0\.1:54321/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/*' }, body: '[]' }));
    await page.goto('/#/install');
    await expect(page.getByRole('region', { name: 'ติดตั้งแอป' })).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
