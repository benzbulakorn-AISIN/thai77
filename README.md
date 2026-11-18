# เที่ยวไทย 77 จังหวัด (Thailand 77 Trip Planner)

เว็บแอปวางแผนเที่ยวทั่วไทย: แผนที่ 77 จังหวัด → เลือกสถานที่ → จัดเส้นทางแนะนำเบื้องต้น → Timeline → งบประมาณ → บันทึกความทรงจำ
สร้างด้วย **React + TypeScript + Vite + Tailwind**, ฐานข้อมูล/Auth/Storage ด้วย **Supabase**, เผยแพร่บน **GitHub Pages** (HashRouter)

> คู่มือนี้เขียนสำหรับตั้งค่า "ตั้งแต่ศูนย์" ผ่านเว็บเบราว์เซอร์ล้วน ๆ (ไม่ต้องติดตั้งโปรแกรมในเครื่อง)

## สารบัญ
1. [สิ่งที่ต้องมี](#1-สิ่งที่ต้องมี)
2. [ตั้งค่า Supabase](#2-ตั้งค่า-supabase)
3. [ตั้งค่า GitHub + Deploy](#3-ตั้งค่า-github--deploy)
4. [ตั้งค่าผู้ใช้และ Admin](#4-ตั้งค่าผู้ใช้และ-admin)
5. [Edge Function ลบบัญชี](#5-edge-function-ลบบัญชี)
6. [การทดสอบ](#6-การทดสอบ)
7. [Backup ระดับระบบ](#7-backup-ระดับระบบ)
8. [Checklist ความปลอดภัย](#8-checklist-ความปลอดภัย)
9. [แก้ปัญหาที่พบบ่อย](#9-แก้ปัญหาที่พบบ่อย)
10. [Checklist เกณฑ์ MVP](#10-checklist-เกณฑ์-mvp)

---

## 1. สิ่งที่ต้องมี
| อะไร | หมายเหตุ |
|---|---|
| บัญชี GitHub | repo แบบ **Public** (GitHub Pages ฟรีต้องเป็น Public) — จึงห้ามใส่ความลับใน repo เด็ดขาด |
| บัญชี Supabase (Free) | โปรเจกต์ Free จะถูก Pause เมื่อไม่มีการใช้งานนาน — เช็กเงื่อนไขล่าสุดที่หน้า Pricing |
| (ไม่บังคับ) Node.js 20+ | เฉพาะถ้าจะรันบนเครื่องตัวเอง |

## 2. ตั้งค่า Supabase

### 2.1 รัน SQL ตามลำดับ (SQL Editor → New query → วาง → Run ทีละไฟล์)
| ลำดับ | ไฟล์ | ทำอะไร |
|---|---|---|
| 1 | `supabase/migrations/20261117000001_init_schema.sql` | สร้าง 29 ตาราง, trigger |
| 2 | `…000002_rls.sql` | เปิด RLS และ Policy ทุกตาราง |
| 3 | `…000003_storage.sql` | bucket รูป + Policy |
| 4 | `…20261118000004_status_upsert.sql` | unique constraint สำหรับ upsert |
| 5 | `…000005_trip_items_auto.sql` | คอลัมน์ `is_auto` |
| 6 | `…000006_budget.sql` | ค่าอาหารต่อคนของทริป |
| 7 | `…000007_admin_review.sql` | ฟังก์ชันตรวจสถานที่ที่ผู้ใช้เสนอ (ไม่เปิดเผยบันทึกลับ) |
| 8 | `supabase/seed.sql` | 6 ภาค, 26 หมวดสถานที่, 13 หมวดงบ |
| 9 | `supabase/seed_geo.sql` | 77 จังหวัด + อำเภอ (ได้จาก workflow **Build Geo Data** — ดูข้อ 3.4) |
| 10 | `supabase/seed_places.sql` | สถานที่ตัวอย่าง (Demo) (ได้จาก workflow **Build Place Seed**) |

ทุกไฟล์รันซ้ำได้โดยไม่เสียหายเฉพาะไฟล์ seed ส่วน migration ให้รันแต่ละไฟล์ครั้งเดียว

### 2.2 ตั้งค่า Auth
**Authentication → Sign In / Providers → Email:** เปิดไว้ และ (ถ้าใช้กัน 2 คน) **ปิด "Allow new users to sign up"**
**Authentication → URL Configuration:**
- Site URL: `https://<ชื่อ GitHub>.github.io/<ชื่อ repo>/`
- Redirect URLs: ค่าเดียวกัน (ใช้กับลิงก์ลืมรหัสผ่าน)

### 2.3 จด 2 ค่าไว้ใช้ (⚙️ Project Settings → API)
- **Project URL** → `VITE_SUPABASE_URL`
- **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

⛔ **ห้ามนำ `service_role` / secret key ไปใส่ในเว็บหรือ GitHub** (สคริปต์ `check-secrets` จะหยุด Deploy ถ้าเจอ)

## 3. ตั้งค่า GitHub + Deploy

### 3.1 อัปโหลดโค้ด
สร้าง repo → **Add file → Upload files** → ลากไฟล์/โฟลเดอร์ "ข้างใน" เข้าไป (ไม่ใช่ตัวโฟลเดอร์ชั้นนอก)
ไฟล์/โฟลเดอร์ที่ขึ้นต้นด้วยจุด (`.github`, `.gitignore`, `.env.example`) อัปโหลดผ่านหน้าเว็บไม่ได้ ต้อง **Add file → Create new file** แล้วพิมพ์ path เต็ม เช่น `.github/workflows/deploy.yml` และวางเนื้อหาจากโฟลเดอร์ `workflows/` ในชุดไฟล์

### 3.2 เปิด GitHub Pages
**Settings → Pages → Source = GitHub Actions**

### 3.3 ใส่ค่า Supabase
**Settings → Secrets and variables → Actions → แท็บ Variables → New repository variable**
| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |

### 3.4 Workflow ทั้งหมด (สร้างผ่าน Create new file)
| ไฟล์ | หน้าที่ | เมื่อไหร่ที่รัน |
|---|---|---|
| `.github/workflows/deploy.yml` | **Test → Build → ตรวจ Build → Deploy** | ทุกครั้งที่ Commit เข้า `main` |
| `.github/workflows/build-geo.yml` | ดาวน์โหลดเส้นขอบ 77 จังหวัด/อำเภอ แล้วสร้าง `seed_geo.sql` | รันเองครั้งเดียว |
| `.github/workflows/build-places.yml` | ดึงพิกัดสถานที่ตัวอย่างจาก OpenStreetMap แล้วสร้าง `seed_places.sql` | รันเองหลัง Build Geo Data |
| `.github/workflows/e2e.yml` | ทดสอบหน้าจอ 4 ขนาด (Playwright) | รันเองเมื่ออยากทดสอบ |

**ลำดับ Deploy ครั้งแรก:** Build Geo Data → รัน `seed_geo.sql` → Build Place Seed → รัน `seed_places.sql` → ตรวจว่า Deploy ขึ้น ✅

เว็บอยู่ที่ `https://<ชื่อ GitHub>.github.io/<ชื่อ repo>/`

> Deploy จะ **หยุด** (❌) เมื่อ: Test ไม่ผ่าน, พบ Secret Key ใน repo, `base path` ผิด, ยังไม่ได้ตั้ง Variables, หรือยังไม่มีไฟล์แผนที่ — อ่านข้อความภาษาไทยในขั้นที่แดง
> กรณีฉุกเฉินที่ต้องข้าม Test: Actions → Deploy → Run workflow → ติ๊ก "ข้ามการรัน Test"

## 4. ตั้งค่าผู้ใช้และ Admin
1. สร้างผู้ใช้: **Authentication → Users → Add user → Create new user** (ติ๊ก **Auto Confirm User**)
2. ตั้ง Admin (SQL Editor) — เปลี่ยนอีเมลเป็นของจริง:
```sql
update public.profiles set role = 'admin'
where id in (select id from auth.users where email in ('you@example.com', 'partner@example.com'));
```
3. ตั้งรหัสผ่านใหม่ให้ผู้ใช้ที่สร้างผ่าน Dashboard (ถ้าลืม):
```sql
update auth.users set encrypted_password = extensions.crypt('รหัสใหม่อย่างน้อย 8 ตัว', extensions.gen_salt('bf'))
where email = 'you@example.com';
```

## 5. Edge Function ลบบัญชี
ปุ่ม "ลบบัญชีถาวร" ต้องใช้ฟังก์ชันฝั่งเซิร์ฟเวอร์ (เพราะต้องใช้ service role ซึ่งห้ามอยู่ในเบราว์เซอร์)
Supabase → **Edge Functions → Deploy a new function → Via Editor** → ชื่อ `delete-account` → วางเนื้อหา `supabase/functions/delete-account/index.ts` → Deploy
(ค่า `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` Supabase ใส่ให้ฟังก์ชันเอง ไม่ต้องกรอก)

## 6. การทดสอบ
ดูรายละเอียดใน [`docs/TESTING.md`](docs/TESTING.md)
| ชั้นการทดสอบ | อยู่ที่ | รันอย่างไร |
|---|---|---|
| Unit + Integration | `tests/` | อัตโนมัติใน `deploy.yml` หรือ `npm test` |
| ตรวจ Secret / Build | `scripts/check-*.mjs` | อัตโนมัติใน `deploy.yml` |
| **RLS Security** | `supabase/tests/rls.test.sql` | วางใน Supabase SQL Editor แล้ว Run — ผลขึ้นเป็น "ERROR" สีแดงที่มีรายงานอยู่ข้างใน (ตั้งใจ เพื่อ Rollback ข้อมูลทดสอบ) ท้ายรายงานต้องเป็น `ALL PASSED` |
| Mobile / Responsive | `e2e/` | Actions → **E2E Responsive** → Run workflow + เช็กลิสต์ในเครื่องจริงใน `docs/TESTING.md` |

## 7. Backup ระดับระบบ
แยกจาก Backup JSON ส่วนตัวของผู้ใช้ (หน้า โปรไฟล์ → สำรอง/กู้คืนข้อมูล)
| สิ่งที่ต้องสำรอง | วิธี (Free) | วิธี (เมื่อรับค่าใช้จ่ายได้) |
|---|---|---|
| ข้อมูลสถานที่ส่วนกลาง | Admin → นำเข้า → **Export** เก็บไฟล์ CSV ไว้เป็นระยะ | Supabase Pro: Backup อัตโนมัติรายวัน (ตรวจเงื่อนไขล่าสุดก่อนสมัคร) |
| ข้อมูลส่วนตัวของแต่ละคน | ให้แต่ละคนกด **Backup (JSON)** เดือนละครั้ง | — |
| ไฟล์รูป | เก็บรูปต้นฉบับไว้ในมือถือ / Google Photos | สคริปต์ดาวน์โหลด Storage ทั้งหมดบนเครื่องตัวเอง |
| โค้ด | อยู่ใน GitHub อยู่แล้ว | — |

⚠️ **อย่าตั้งให้ Backup ฐานข้อมูลลง repo นี้** เพราะ repo เป็น Public

## 8. Checklist ความปลอดภัย
- [ ] ใน repo ไม่มีไฟล์ `.env*` (ยกเว้น `.env.example`) — `check-secrets` ตรวจให้อัตโนมัติ
- [ ] ใน GitHub Variables มีเฉพาะ `VITE_SUPABASE_URL` และ anon/publishable key
- [ ] รัน `rls.test.sql` แล้ว **ALL PASSED** (ทำซ้ำหลังแก้ Policy ทุกครั้ง)
- [ ] ปิด "Allow new users to sign up" ถ้าใช้กันเฉพาะคนที่เชิญ
- [ ] bucket `memory-photos` และ `trip-covers` เป็น Private
- [ ] ตั้ง Admin เฉพาะคนที่ไว้ใจ (Admin เห็นข้อมูลสถานที่ส่วนกลางทั้งหมด แต่ **ไม่เห็น** ทริป/รูป/บันทึกส่วนตัวของผู้อื่น)
- [ ] ถ้าเผลอเปิดเผย service_role key: Supabase → Project Settings → API Keys → **Rotate** ทันที (ลบจาก Git ไม่พอ เพราะประวัติยังอยู่)

## 9. แก้ปัญหาที่พบบ่อย
| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Actions ❌ ที่ขั้น Build ด้วย TypeScript error | แคปหน้า **Annotations** (ไฟล์:บรรทัด) ส่งให้ผู้ดูแล |
| Actions ❌ "Cannot find module './xxx'" | อัปโหลดไฟล์ไม่ครบ — เทียบรายชื่อไฟล์กับ zip |
| ❌ ที่ขั้น "ตรวจผล Build" | อ่านข้อความภาษาไทย: base path ผิด / ยังไม่ตั้ง Variables / ยังไม่มีแผนที่ |
| หน้าเว็บขึ้นแถบแดง "ยังไม่ได้ตั้งค่า VITE_SUPABASE…" | ชื่อ Variable สะกดผิด → แก้แล้ว Re-run workflow |
| หน้าขาว / 404 ของไฟล์ `.js` | `VITE_BASE` ไม่ตรงชื่อ repo (workflow ตั้งให้เองจากชื่อ repo) |
| Login ขึ้น "ไม่ถูกต้อง" | ยังไม่ Confirm อีเมล หรือรหัสผิด → ใช้ SQL ข้อ 4.3 |
| ลิงก์ลืมรหัสผ่านไม่พากลับเว็บ | ยังไม่ตั้ง Site URL / Redirect URL (ข้อ 2.2) |
| แผนที่ไม่ขึ้น / "ยังไม่มีไฟล์แผนที่" | ยังไม่ได้รัน workflow **Build Geo Data** |
| จังหวัดทุกจังหวัดเป็นสีเทา, ตัวเลข 0 | ยังไม่ได้รัน `seed_geo.sql` / `seed_places.sql` |
| ปุ่มสถานะ (อยากไป/ไปมาแล้ว) บันทึกไม่ได้ | ยังไม่ได้รัน migration 004 |
| หน้าทริปโหลดไม่ขึ้น | ยังไม่ได้รัน migration 005/006 |
| หน้า Admin → รอตรวจ มี error | ยังไม่ได้รัน migration 007 |
| รูปไม่ขึ้นหลังเปิดหน้าทิ้งไว้นาน | ลิงก์รูปมีอายุ 1 ชั่วโมง — รีเฟรชหน้า |
| กดลบบัญชีแล้วแจ้งว่ายังไม่ติดตั้งฟังก์ชัน | ทำข้อ 5 |

## 10. Checklist เกณฑ์ MVP
ติ๊กเองหลังทดสอบบนเว็บจริง (ช่อง "ตรวจอัตโนมัติ" = มี Test ครอบคลุมส่วนที่เป็นตรรกะ แต่ยังควรลองใช้จริง)
| # | เกณฑ์ | ตรวจอัตโนมัติ | ทดสอบเอง |
|---|---|---|---|
| 1 | เปิดแผนที่ไทยและเลือกจังหวัดได้ | จุดในเขต/ตำแหน่งชื่อ | ☐ |
| 2 | เปิดหน้าจังหวัด ดูสถานที่ตัวอย่างได้ | ไฟล์ seed | ☐ |
| 3 | กรองตามอำเภอและหมวดหมู่ได้ | — | ☐ |
| 4 | เลือกสถานที่เข้าทริปได้ | — | ☐ |
| 5 | จัดเส้นทางแนะนำเบื้องต้นได้ | ✅ planner / optimizer | ☐ |
| 6 | สร้าง Timeline รายวันได้ | ✅ scheduler | ☐ |
| 7 | คำนวณงบประมาณได้ | ✅ budget | ☐ |
| 8 | บันทึกว่าเคยไปแล้วได้ | — | ☐ |
| 9 | Upload รูปขึ้น Supabase Storage ได้ | ✅ Policy (RLS) | ☐ |
| 10 | เพิ่มสถานที่ส่วนตัวได้ | ✅ Policy (RLS) | ☐ |
| 11 | Export / Import Backup ได้ | ✅ backupModel | ☐ |
| 12 | เปลี่ยน Theme ได้ | ✅ e2e | ☐ |
| 13 | Login และ RLS ทำงานถูกต้อง | ✅ rls.test.sql | ☐ |
| 14 | เปิดใช้งานบนมือถือได้ | ✅ e2e (เมื่อรัน) | ☐ |
| 15 | Deploy บน GitHub Pages ได้สำเร็จ | ✅ deploy.yml | ☐ |
| 16 | Refresh หน้า Route ย่อยแล้วไม่ 404 | ✅ e2e (HashRouter) | ☐ |
| 17 | ไม่มี Secret Key อยู่ใน Repository | ✅ check-secrets | ☐ |

---
ข้อมูลพิกัดสถานที่ตัวอย่าง © ผู้ร่วมสร้าง OpenStreetMap (ODbL) · ขอบเขตจังหวัด/อำเภอ: OCHA COD-AB / กรมแผนที่ทหาร — ดู `public/geo/ATTRIBUTION.md`
