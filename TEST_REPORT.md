# ผลตรวจ Part 8.1c

วันที่จัดทำ: 21 พฤศจิกายน 2026

## ฐานที่ใช้ — ผ่าน

- ดาวน์โหลด `thai77-part8.1b-budget-clear-delete-undo-20261121.zip` จากไฟล์ผล Part 8.1b
- SHA-256: `3f249f2f48b7182dc6c60e7ca7ef9add7549519ea1d259f985470ab9da985c20` ตรงกับรายงาน Part 8.1b
- `unzip -t`: ผ่าน ไม่มีไฟล์เสีย
- `sha256sum -c MANIFEST.sha256`: ไฟล์ฐาน 11 ไฟล์ผ่านทั้งหมดก่อนแก้
- เริ่มจากไฟล์ล่าสุด 8.1b ไม่ใช้โค้ดก่อน 8.1b

## ทดสอบแล้วในสภาพแวดล้อมนี้

### 1. TypeScript แบบแยกส่วน — ผ่าน

- TypeScript 6.0.2, `strict: true`, `noEmit: true`
- ตรวจ production ที่แก้ และ test ของ Part 8.1a–8.1c
- ใช้ type stub เฉพาะ dependency ของ Repository ที่ไม่ได้รับมา เช่น React, component, Supabase client และชนิดทริป
- ผล: `PASS isolated TypeScript strict check (production + Part 8.1a/8.1b/8.1c tests)`

**ข้อจำกัด:** เป็น isolated type-check ไม่ใช่ `npm run build` ของ Repository จริง จึงไม่อ้างว่า Build จริงผ่าน

### 2. Runtime assertions แบบแยกส่วน — ผ่าน 34 assertions

รัน JavaScript ที่ compile จาก `budgetApi.ts`, `calc.ts`, `pendingBudgetAction.ts` ครอบคลุม:

- เงินติดลบ/ทศนิยมสามตำแหน่ง/ศูนย์/สตางค์และ summary เดิม
- Undo 6 วินาที, clear/delete optimistic state และ restore snapshot
- แปลงทุก AutoRow เป็น payload ครบโดยไม่ทิ้งหมวดที่หาไม่พบเงียบ ๆ
- เรียก RPC `replace_budget_auto_items` หนึ่งครั้งด้วยชุดเต็ม
- พิสูจน์ว่า client ไม่เรียก `.from('budget_items').delete()/insert()` สำหรับการคำนวณใหม่
- รองรับ replacement ว่างผ่าน RPC
- เทียบชุดผลลัพธ์โดยไม่อิง id/ลำดับ และปฏิเสธจำนวนแถว/ยอด/สถานะที่ไม่ตรง
- เมื่อ response ขาด เก็บ intended set ไว้สำหรับ read-only verification
- Regression API clear/delete และ snapshot match ของ Part 8.1b

ผล: `PASS 34 isolated runtime assertions`

### 3. จงใจทำให้ผิด — ชุดตรวจจับได้

- ทำสำเนาชั่วคราวนอกไฟล์ส่งมอบ
- เปลี่ยนชื่อ RPC จาก `replace_budget_auto_items` เป็น `replace_budget_auto_items_broken`
- compile แล้วรัน assertions ชุดเดิม
- ผล: exit code 1 ที่ assertion `correct atomic RPC`
- ตรวจไฟล์ส่งมอบแล้วว่ายังใช้ชื่อที่ถูกต้อง; mutant ไม่รวมใน ZIP

### 4. ตรวจโครง Migration/SQL แบบออฟไลน์ — ผ่านในขอบเขตที่ทำได้

- Migration ใหม่เป็นเลข 011
- ใช้ `CREATE OR REPLACE FUNCTION`, รันซ้ำได้
- ไม่มี `ALTER TABLE`, `DROP TABLE`, การแก้ Policy หรือคำสั่งเปลี่ยนข้อมูลขณะติดตั้ง
- function เป็น `SECURITY INVOKER`, ตรวจ `auth.uid()` + `can_edit_trip`, ให้ EXECUTE เฉพาะ `authenticated`
- DELETE จำกัด `trip_id` + `is_auto = true`
- DELETE และ INSERT อยู่ใน function call เดียวและไม่มี exception handler ที่กลืนข้อผิดพลาด จึงให้ PostgreSQL rollback statement/transaction ตามปกติ
- มี advisory transaction lock ต่อ trip
- SQL test ครอบด้วย `BEGIN ... ROLLBACK` และตรวจ valid replacement, manual preservation, failed-INSERT rollback, empty set, permission และ lock

**ข้อจำกัด:** Container ไม่มี `psql`/Supabase database จึงยังไม่ได้ parse/execute Migration หรือ SQL test กับ PostgreSQL จริง

### 5. ตรวจ Regression ขอบเขต — ผ่าน

- `BudgetItemSheet.tsx`, `calc.ts`, `pendingBudgetAction.ts` และ test 8.1a–8.1b คงอยู่ครบ
- การแก้ วัน/เวลาจ่ายจริง Validation เงิน สตางค์ ล้างยอด ลบทั้งรายการ Undo 6 วินาที และ snapshot concurrency ไม่ถูกลด
- ไม่แก้หน้าแชร์, Guest Mode, PWA, `.ics`, Search หรือทริปหลายจังหวัด
- ไม่แก้ RLS เดิมและไม่ลดจำนวน test เดิม

## Unit Test ที่เพิ่ม

`src/features/budget/budgetApi.part8_1c.test.ts` มี 6 cases:

1. ใช้ RPC เดียวและไม่มี separate DELETE/INSERT
2. ชุดว่างยังผ่าน RPC แบบ atomic
3. หมวดหายถูกปฏิเสธก่อนเรียก DB
4. RPC error เก็บ intended set เพื่อยืนยันภายหลัง
5. partial/mismatched response ถูกปฏิเสธ
6. multiset compare ไม่อิง id/ลำดับ

รวม Unit Test ใน ZIP 5 ไฟล์: ของเดิม 8.1a–8.1b จำนวน 4 ไฟล์ และ 8.1c อีก 1 ไฟล์

## SQL Test ที่เพิ่ม

`supabase/tests/budget_atomic_replace.part8_1c.test.sql`

- เปลี่ยนข้อมูลเฉพาะใน transaction แล้ว `ROLLBACK`
- ใช้ row จริงหนึ่งแถวเป็น FK-valid fixture และ impersonate `created_by` ภายใน transaction
- จงใจให้ INSERT ผิด FK หลัง DELETE แล้วตรวจว่าชุดก่อนหน้ายังอยู่
- ไม่เปลี่ยนข้อมูลจริงเมื่อสคริปต์จบ

## ยังไม่ได้ทดสอบ

- `npm run build`/TypeScript ของ Repository จริง เพราะไม่มี Repository และ dependency ทั้งชุด
- Vitest จริง: package registry ตอบ HTTP 403 จึงไม่ได้อ้างว่าผ่าน แม้ source test ผ่าน isolated TypeScript
- Migration 011 และ SQL test บน Supabase/PostgreSQL จริง
- RLS 86, Search 50, Share 87, Share Preview 29
- Owner/Editor/Viewer/anon จริง และเนื้อหา `is_trip_member` / `can_edit_trip`
- เครือข่ายขาดกลาง RPC จริง และ concurrency สอง session จริง
- React component/Playwright, responsive 360px และทุกธีม
- หน้าแชร์ไม่เปิดเผยงบ, Guest Mode, PWA ที่ไม่แคชข้อมูลส่วนตัว, `.ics`
- GitHub Actions/Pages deployment

ต้องรันรายการเหล่านี้ตาม `README_TH.md` ก่อน Merge เข้า `main`
