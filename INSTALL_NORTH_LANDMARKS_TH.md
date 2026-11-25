# คู่มือติดตั้ง Landmark ภาคเหนือผ่าน GitHub + Supabase (Migration 012)

วันที่จัดทำ: 22 พฤศจิกายน 2026  
ขอบเขต: 9 จังหวัดภาคเหนือ 18 Landmark อันดับ 1–2 เท่านั้น

> ชุดนี้ **ไม่ได้นำเข้า place, ไม่ได้เชื่อมฐานข้อมูลจริง, ไม่ได้ Publish และไม่ได้อัปโหลดรูปแทนผู้ใช้** ข้อมูล Landmark และรูปทั้งหมดเริ่มเป็น `pending` / `is_published=false`; รูปที่ยังไม่ผ่านการตรวจเต็มขนาดใช้ AutoCover พร้อมป้าย “ภาพประกอบ”

## 1) สิ่งที่ชุดนี้เพิ่ม

- ตาราง `province_landmarks` เชื่อม `province_id` + `place_id` จริง รองรับอันดับ 1–3, เหตุผลภาษาไทย และสถานะ `draft/pending/published/rejected`
- RLS: คนทั่วไปอ่านได้เฉพาะ Landmark ที่เผยแพร่ และ place ที่อ้างถึงยังเผยแพร่อยู่; Admin เท่านั้นที่เชื่อม แก้ ปฏิเสธ หรือ Publish
- ฟังก์ชันแยก “อนุมัติ Candidate” ออกจาก “Publish” อย่างชัดเจน
- metadata รูปใช้ตาราง `place_images` เดิม ไม่สร้างระบบรูปซ้ำ; แถวที่ยังไม่ตรวจเต็มขนาดถูกซ่อนด้วย RLS และไม่ถูกตั้งเป็น `cover_image_id`
- หน้า `#/admin/landmarks` สำหรับ Preview การจับคู่, Export mapping `place_id` จริง, เชื่อมข้อมูลเป็น pending, ตรวจ/ปฏิเสธ และ Publish
- หน้าจังหวัดอ่านเฉพาะ Landmark ที่ published เรียงอันดับ 1–3
- ไม่มีการแก้กฎตราประทับจังหวัดใน Migration นี้

## 2) ลำดับ Migration ที่ตรวจพบจริง

โฟลเดอร์ OneDrive `thai77-current/thai77-main/thai77-main` ที่ตรวจรอบนี้มีไฟล์ Migration สูงสุด `20261120000010_trip_share_preview.sql` แต่ชุดงานก่อนหน้ามี Migration 011 สำหรับงบแบบ atomic คือ:

`20261121000011_budget_auto_replace_atomic.sql`

จึงจัด ZIP เต็มโดยเติมไฟล์ฐาน 001–003 และ 011 ที่มีอยู่จริงจากชุดเดิม แล้วใช้เลขถัดไป:

`20261122000012_north_province_landmarks.sql`

ห้ามเปลี่ยนชื่อ 012 เป็น 011 และห้ามรัน 011 ซ้ำหากฟังก์ชัน `replace_budget_auto_items` มีอยู่แล้ว

## 3) สำรองข้อมูลก่อนติดตั้ง

1. เข้าเว็บ Thai77 → `Admin → นำเข้า` → Export สถานที่ทั้งหมด เก็บ CSV ไว้
2. Supabase → **Database → Backups** ตรวจว่ามี backup ล่าสุด หรือสร้าง backup ตามแผนของโครงการ
3. Supabase → **SQL Editor → New query** ตรวจสถานะ:

```sql
select
  to_regprocedure('public.replace_budget_auto_items(uuid,jsonb)') as migration_011,
  to_regclass('public.province_landmarks') as migration_012;
```

- ถ้า `migration_011` ไม่เป็น `null` และ `migration_012` เป็น `null`: รันเฉพาะ 012
- ถ้าทั้งคู่เป็น `null`: รัน 011 ก่อน แล้วรัน 012
- ถ้า `migration_012` ไม่เป็น `null`: ตรวจโครงสร้าง/ทดสอบก่อน อย่ารัน seed หรือ Import ซ้ำโดยไม่ Preview

## 4) อัปเดตโค้ดผ่านเว็บ GitHub

ZIP นี้เป็น repository เต็ม จึงใช้ได้ทั้งสร้าง branch ใหม่หรือเปรียบเทียบไฟล์ก่อน merge

1. ดาวน์โหลดและแตก ZIP ในเครื่อง
2. เปิด repository บน GitHub → **Code → Branches → New branch** ตั้งชื่อเช่น `north-landmarks-012`
3. เปลี่ยนมา branch ใหม่
4. ใช้ **Add file → Upload files** แล้วอัปโหลดไฟล์/โฟลเดอร์จากภายใน `thai77-main/` โดยรักษา path เดิม
5. ตรวจอย่างน้อยว่าไฟล์ต่อไปนี้อยู่ใน commit:
   - `supabase/migrations/20261122000012_north_province_landmarks.sql`
   - `supabase/tests/landmarks_north.test.sql`
   - `src/features/admin/landmarkImportModel.ts`
   - `src/features/admin/landmarkApi.ts`
   - `src/features/places/landmarksApi.ts`
   - `src/pages/admin/AdminLandmarksPage.tsx`
   - `data/landmarks/north/northern_landmark_link_manifest.json`
   - `docs/LANDMARKS_NORTH_INSTALL_TH.md`
6. Commit ด้วยข้อความเช่น `Add safe Northern province landmark workflow`
7. เปิด Pull Request แล้วดู **Actions** ให้ TypeScript/test/build ผ่าน
8. **ยังไม่ Merge** เพราะโค้ดใหม่อ่านคอลัมน์ `place_images.image_status`; ไปติดตั้งและทดสอบ SQL ตามหัวข้อ 5 ก่อน แล้วจึงกลับมา Merge

> หาก GitHub เว็บปฏิเสธการอัปโหลดจำนวนมาก ให้ Upload เฉพาะไฟล์ที่เปลี่ยนตาม `CHANGED_FILES.txt` ใน ZIP โดยยังคง path เดิม ห้ามวางไฟล์ทั้งหมดไว้ที่ root

## 5) ติดตั้ง SQL ผ่านเว็บ Supabase

### 5.1 Migration 011 (เฉพาะกรณียังไม่มี)

เปิด `supabase/migrations/20261121000011_budget_auto_replace_atomic.sql` → คัดลอกทั้งหมด → Supabase SQL Editor → New query → Run

ตรวจ:

```sql
select to_regprocedure('public.replace_budget_auto_items(uuid,jsonb)');
```

### 5.2 Migration 012

เปิด `supabase/migrations/20261122000012_north_province_landmarks.sql` → คัดลอกทั้งหมด → New query → Run

Migration รันซ้ำได้และไม่ลบข้อมูลเดิม แต่ควรรันตามลำดับเพียงครั้งเดียวใน production

### 5.3 Dry run หลังติดตั้ง (ไม่เขียนข้อมูล)

```sql
begin;

select
  to_regclass('public.province_landmarks') is not null as has_landmark_table,
  to_regprocedure('public.admin_link_province_landmark(uuid,text,text,smallint,text,jsonb,jsonb)') is not null as has_link_rpc,
  to_regprocedure('public.admin_publish_province_landmark(uuid)') is not null as has_publish_rpc;

select column_name
from information_schema.columns
where table_schema='public' and table_name='place_images'
  and column_name in ('review_key','image_status','cover_mode','review_note')
order by column_name;

select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename in ('province_landmarks','place_images');

select count(*) as linked_landmarks_before_import from public.province_landmarks;

rollback;
```

ค่าที่คาดหวัง: boolean ทั้งสามเป็น `true`, พบ 4 คอลัมน์, RLS เป็น `true`, และจำนวน Landmark ยังเป็น 0 ก่อนเชื่อม

### 5.4 SQL test

เปิด `supabase/tests/landmarks_north.test.sql` → Run ทั้งไฟล์

สคริปต์จบด้วย `ERROR` โดยตั้งใจเพื่อ rollback ข้อมูลทดสอบ ให้อ่านรายงานใน error และต้องลงท้าย:

`ALL PASSED 30/30 (rollback complete)`

จากนั้นชุดเดิมต้องยังคงผ่านโดยไม่ลดจำนวน:

- `supabase/tests/rls.test.sql` — 86
- `supabase/tests/search.test.sql` — 50
- ชุด Share เดิม — 87
- `supabase/tests/share_preview.test.sql` — 29

### 5.5 Merge และ Deploy หลัง SQL ผ่าน

กลับไปที่ Pull Request บน GitHub → Merge → รอ workflow Deploy สำเร็จ แล้วเปิดเว็บแบบ hard refresh หนึ่งครั้งก่อนทดสอบหน้า Admin

## 6) ขั้นตอนข้อมูลจริง — แยก Import places และเชื่อม Landmark

### ขั้น A: Import place ใหม่ 16 แห่ง

1. เข้าเว็บเวอร์ชันใหม่ด้วยบัญชี Admin
2. `Admin → นำเข้า`
3. เลือก `data/landmarks/north/northern_places_import_preview.csv`
4. เลือก **เพิ่มเฉพาะใหม่**
5. กด Preview
6. ผลต้องเป็น: เพิ่ม 16, ซ้ำ 0, คำเตือน 0, ผิดพลาด 0
7. ตรวจรายชื่อ 16 แถว แล้วจึงกดยืนยัน Import ด้วยตนเอง

ไฟล์นี้ไม่มีดอยสุเทพและดอยอินทนนท์ จึงไม่สร้างสองแห่งเดิมซ้ำ และไม่มี UUID ปลอม

### ขั้น B: Preview การเชื่อม Landmark 18 แห่ง

1. ไป `Admin → Landmark`
2. เลือก `data/landmarks/north/northern_landmark_link_manifest.json`
3. ระบบโหลด places ปัจจุบันและ Preview เท่านั้น ยังไม่เขียนข้อมูล
4. ผลต้องเป็น:
   - ทั้งหมด 18
   - พร้อม 18
   - ผิดพลาด 0
   - ID เดิม 2 / จับคู่ชื่อในจังหวัด 16
5. กด **Export mapping place_id จริง** และเก็บ `northern_landmark_place_id_mapping.csv` ไว้เป็นหลักฐาน
6. หากมี “ยังไม่พบสถานที่”, “ชื่อซ้ำมากกว่า 1 แห่ง” หรือ province mismatch ให้หยุด ห้ามกดเชื่อม และแก้ด้วย `production_place_id` จริงจาก Export เท่านั้น

### ขั้น C: เชื่อมเป็น pending

1. เมื่อ Preview พร้อมครบ 18 กด **เชื่อมเป็น pending (ไม่ Publish)**
2. ยืนยันข้อความ
3. ระบบจะ:
   - สร้าง/อัปเดต `province_landmarks` แบบ idempotent
   - บังคับทุกแถวเป็น `pending/is_published=false`
   - เพิ่ม source แบบไม่ให้ค่าว่างทับค่าเดิม
   - เก็บ metadata รูปใน `place_images` เดิม
   - ไม่สร้าง place, ไม่อัปโหลดรูป, ไม่ตั้ง cover, ไม่ Publish
4. หน้าจอต้องขึ้น “เชื่อมแล้ว 18 แห่ง · เผยแพร่ 0 แห่ง”

### ขั้น D: ตรวจและ Publish ทีละแห่ง

1. เปิดรายการ Landmark → **ตรวจสถานที่**
2. ตรวจข้อมูล place, แหล่งอ้างอิง, พิกัด และตั้ง place เป็น `verified` + `is_published=true` เมื่อพร้อมจริง
3. รูป: เปิดหน้า File Commons จากหน้า Landmark และตรวจไฟล์เต็มขนาด เรื่ององค์ประกอบ ลายน้ำ บุคคล ป้าย และครอป
4. ถ้ายังตรวจไม่ครบ ให้คง AutoCover/“ภาพประกอบ”; ห้ามเปลี่ยน image metadata pending เป็น approved
5. การกด **บันทึกการตรวจ** หรือการคง Candidate เป็น pending **ไม่ใช่ Publish**
6. ปุ่ม **เผยแพร่ Landmark** จะทำงานได้เมื่อ place พร้อมแล้วเท่านั้น
7. ตรวจหน้าจังหวัดด้วยบัญชีทั่วไป/โหมดไม่ระบุตัวตน ต้องเห็นเฉพาะแถวที่ published

## 7) Preview/ตรวจหลังติดตั้ง

- Admin เห็นแถว pending ได้; ผู้ใช้ทั่วไปอ่านไม่ได้
- ผู้ใช้ทั่วไปอ่าน Landmark ได้เมื่อทั้ง Landmark และ place ยัง published
- ปิด place หรือเปลี่ยน verification ออกจาก verified แล้ว Landmark ถูก unpublish อัตโนมัติ
- รูป pending/missing/rejected ไม่ถูกโหลดเป็นรูปจริง
- ไม่มีการเปลี่ยนกฎตราประทับจังหวัด
- การรันเชื่อม bundle ซ้ำไม่สร้าง Landmark/source/image metadata ซ้ำ
- mapping ต้องรักษา ID เดิม:
  - ดอยสุเทพ `b7cf4a41-440f-5930-805c-803304cfa2e3`
  - ดอยอินทนนท์ `8b4978da-715e-5a35-8c17-24634c833aab`
