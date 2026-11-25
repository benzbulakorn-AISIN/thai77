# ผลตรวจ — Landmark ภาคเหนือ / Migration 012

วันที่ตรวจ: 22 พฤศจิกายน 2026 (GMT+07:00)

## ฐานที่ใช้

- Repository: OneDrive `thai77-current/thai77-main/thai77-main` (`thai77-main.zip`)
- ชุดข้อมูล: `north_landmark_import_readiness_export_matched.zip`
- Export จริง: `thai77-places-2026-11-22.csv` 77 แถว
- Preview ที่ผู้ใช้ทำจริงบนหน้า Admin: เพิ่ม 16, ซ้ำ 0, คำเตือน 0, ผิดพลาด 0 และยังไม่ได้ยืนยัน Import
- พบ Migration สูงสุดในโฟลเดอร์ repository เป็น 010; ตรวจพบ Migration 011 ที่มีอยู่จริงในชุด Part 8.1c และรวมเข้ากับ ZIP เต็มก่อนสร้าง 012

## ผลที่ผ่านใน container นี้

### 1. TypeScript แบบแยกส่วน — ผ่าน

ใช้ TypeScript 6.0.2:

```bash
tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler \
  src/features/admin/landmarkImportModel.ts \
  src/features/admin/importModel.ts src/features/admin/csv.ts src/features/admin/placeForm.ts
```

ผล: ผ่าน ไม่มี error

ไฟล์ production ที่แก้ทั้งหมดผ่านการ parse/transpile check ด้วย `--noCheck`:

- `landmarkImportModel.ts`
- `landmarkApi.ts`
- `landmarksApi.ts`
- `AdminLandmarksPage.tsx`
- `ProvincePage.tsx`
- `router.tsx`
- `AdminShell.tsx`
- `placeImagesApi.ts`
- `BudgetPage.tsx` จาก Part 8.1c

### 2. Runtime test ของ workflow จับคู่ — ผ่าน

compile pure import pipeline เป็น CommonJS แล้วรัน assertion จริงด้วย Node:

- bundle 18/18 แถว parse ผ่าน
- รักษา production UUID เดิม 2 แห่ง
- อีก 16 แห่งจับคู่ชื่อไทยตรงกันในจังหวัดหลังมี place จริง
- mapping CSV ได้ 18 แถว
- เมื่อเอา place ใหม่ออก 1 แห่ง ระบบหยุด 1 แถวและไม่สร้าง UUID
- ไฟล์ที่พยายามตั้ง image เป็น `approved` ถูกปฏิเสธ

ผล:

`PASS landmark model runtime: 18/18 matched; 2 fixed IDs; 16 exact-name; missing-place and approved-image gates enforced`

### 3. ตรวจ manifest — ผ่าน

- 18 Landmark / 9 จังหวัด / อันดับ 1–2 ไม่ซ้ำ
- `pending` + `is_published=false` ทุกแถว
- `production_place_id` จริง 2 แถว
- source 22 รายการ
- รูป approved 0 รายการ
- สถานะรูปมีเฉพาะ `license_verified_visual_pending`, `missing`, `rejected_as_cover`

### 4. ตรวจ Migration/SQL แบบ offline — ผ่านในขอบเขตที่ทำได้

- ชื่อไฟล์ `20261122000012_north_province_landmarks.sql`
- 52 SQL statements ตามตัวแบ่งของ `sqlparse`
- dollar quote สมดุล
- ไม่มี `DROP TABLE` หรือ `TRUNCATE`
- ไม่พบ identifier ของกฎตราจังหวัด (`province_badges`, `award_landmark_badge`)
- ใช้ `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`, `DROP TRIGGER IF EXISTS`
- SQL test ใหม่มี 30 checks และครอบ transaction ที่จบด้วย exception เพื่อ rollback

### 5. Regression source — ไม่ลดชุดเดิม

ตรวจ byte-for-byte เทียบกับ repository ฐาน:

- RLS SQL เดิม: unchanged, SHA-256 `14b214c4f3676781e103ab2792680776d52ad8970b7ea0773ec37012641a9c1e` และยังมี 86 checks
- Search SQL เดิม: unchanged, SHA-256 `3589ecfff225d1269570895f179da7539533a3d1fd385851499a98ffef019eea` และยังมี 50 checks
- Share Preview SQL เดิม: unchanged, SHA-256 `37da7c48abb5ed044cfc8cba4001f786b7b76b94f3d599ded934c90cb020e99d` และยังมี 29 checks
- `tests/unit/share.test.ts`: unchanged, SHA-256 `789d9110e613f44a655a5831dc911936981cd944cd263ffd6f3d868b5023278d`
- `tests/unit/sharedTrip.test.ts`: unchanged, SHA-256 `ae94eaeb999f44f932bef59233e1c93f11f4c063c23db9322ad7be9aa85ccdef`

## Full npm typecheck/test/build — ยังรันไม่ได้ใน container นี้

ลองติดตั้ง dependency สองครั้ง:

1. registry proxy เริ่มต้น → HTTP 403 ที่ `@dnd-kit/core`
2. `https://registry.npmjs.org` → HTTP 403 ที่ `@dnd-kit/core`

จึง **ไม่อ้างว่า** คำสั่งต่อไปนี้ผ่าน โดยผลที่ลองรันจริงคือ:

- `npm run typecheck` → ล้มเหลวเพราะไม่มี type definition `vite/client`
- `npm test` → ล้มเหลวเพราะไม่มีคำสั่ง `vitest`
- `npm run build` → หยุดที่ TypeScript เพราะไม่มี `vite/client`
- `npm run check:build` → ยังไม่รัน เพราะไม่มี `dist` จาก build

`npm run check:secrets` รันได้โดยไม่ต้องติดตั้ง dependency และผ่านในการตรวจครั้งสุดท้าย: `✓ ไม่พบ Secret Key ในโค้ด (ตรวจ 298 ไฟล์)`

Full GitHub Actions ต้องรันบน Pull Request ที่เข้าถึง package registry ได้ก่อน Merge

## PostgreSQL/Supabase SQL execution — ยังไม่ได้รันใน container นี้

container ไม่มี `psql`, Supabase CLI หรือฐานข้อมูล PostgreSQL จึงยังไม่ได้ execute Migration 012 และ SQL test 30 ข้อจริง ต้องรันผ่าน Supabase SQL Editor ตาม `docs/LANDMARKS_NORTH_INSTALL_TH.md`

## สิ่งที่ไม่ได้ทำ

- ไม่ Import 16 places
- ไม่เชื่อม 18 Landmark กับฐานจริง
- ไม่ Publish
- ไม่อัปโหลดหรืออนุมัติรูป
- ไม่แก้ข้อมูล production
- ไม่ขยายไปภูมิภาคอื่น
- ไม่เปลี่ยนกฎตราประทับจังหวัด
