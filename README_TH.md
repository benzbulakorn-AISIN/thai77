# Part 8.1c — แทนที่ประมาณการจากแผนแบบ Atomic

วันที่จัดทำ: 21 พฤศจิกายน 2026

แพ็กเกจนี้ต่อจาก **Part 8.1b ล่าสุดโดยตรง** โดยใช้ `thai77-part8.1b-budget-clear-delete-undo-20261121.zip` เป็นฐานและตรวจ SHA-256 ได้ตรงกับ `3f249f2f48b7182dc6c60e7ca7ef9add7549519ea1d259f985470ab9da985c20` ก่อนแก้ จึงไม่ย้อนทับปุ่มแก้ไข วัน/เวลาจ่ายจริง การตรวจเงินและสตางค์ การล้างยอดจริง การลบทั้งรายการ การยืนยัน Undo 6 วินาที หรือการป้องกันแก้พร้อมกันของ 8.1a–8.1b

## ปัญหาที่แก้

ของเดิม `replaceAutoRows()` ส่ง 2 คำขอแยกกัน:

1. DELETE รายการอัตโนมัติเดิม
2. INSERT รายการใหม่

ถ้า DELETE สำเร็จแต่ INSERT หรือเครือข่ายล้มเหลว รายการเดิมอาจหายทั้งหมด รอบนี้เปลี่ยนเป็น RPC `replace_budget_auto_items` ที่ทำ DELETE + INSERT ใน Transaction เดียวของ PostgreSQL:

- สำเร็จทั้งชุด หรือ rollback ทั้งชุด
- ตรวจ payload ทั้งชุดก่อนลบ
- ถ้า FK/CHECK/RLS/INSERT ของรายการใดผิด รายการอัตโนมัติเดิมยังอยู่ครบ
- ลบเฉพาะ `is_auto = true`; รายการ manual รวมถึงรายการอัตโนมัติที่ผู้ใช้เคยแก้จนเป็น manual ไม่ถูกแตะ
- ล็อกแบบ transaction เฉพาะ `trip_id` เดียวกัน ป้องกันการคำนวณพร้อมกันสองคำขอแทรกกลางกัน โดยทริปอื่นยังคำนวณพร้อมกันได้
- ใช้ `SECURITY INVOKER`, `can_edit_trip(trip_id)` และ RLS เดิม ไม่เพิ่มหรือผ่อน Policy
- `created_by` มาจาก `auth.uid()` ในฐานข้อมูล ไม่รับ user id จากเบราว์เซอร์
- รองรับผลลัพธ์ว่างอย่างถูกต้อง: แผนที่ไม่มีรายการใหม่จะล้างเฉพาะรายการอัตโนมัติแบบ atomic

## การตรวจผลและเครือข่ายขาดช่วง

หลัง RPC หน้าเว็บอ่าน `budget_items` ซ้ำและเทียบ **ครบทั้งชุด** โดยไม่อิง id หรือลำดับแถว ถ้า response ของ RPC หายหลังฐานข้อมูล commit ระบบจะอ่านสถานะจริงก่อน ไม่ retry การเขียนแบบเดา

ถ้าการอ่านซ้ำก็ล้มเหลว จะแสดงแถบ **“ยังยืนยันผลคำนวณจากแผนไม่ได้”** พร้อมปุ่ม **“ตรวจสอบอีกครั้ง”** ระหว่างนั้นปุ่มแก้ไข/เพิ่ม/คำนวณถูกพักชั่วคราว และเตือนก่อนปิดหน้า

## ไฟล์ที่เพิ่ม/แทนที่

| การทำงาน | พาธใน Repository |
|---|---|
| แทนที่ | `src/pages/BudgetPage.tsx` |
| แทนที่ | `src/features/budget/budgetApi.ts` |
| เพิ่ม Unit Test | `src/features/budget/budgetApi.part8_1c.test.ts` |
| เพิ่ม Migration 011 | `supabase/migrations/20261121000011_budget_auto_replace_atomic.sql` |
| เพิ่ม SQL integration test | `supabase/tests/budget_atomic_replace.part8_1c.test.sql` |

ไฟล์เต็มจาก 8.1b ที่เก็บไว้ใน ZIP เพื่อไม่ให้ย้อนทับของเดิม:

- `src/features/budget/BudgetItemSheet.tsx`
- `src/features/budget/calc.ts`
- `src/features/budget/pendingBudgetAction.ts`
- Test ของ Part 8.1a และ 8.1b ทั้ง 4 ไฟล์

ทุกไฟล์ใน ZIP เป็นไฟล์เต็ม ไม่มีข้อความ “ส่วนที่เหลือเหมือนเดิม”

## SQL ที่ต้องรัน

**ต้องรัน Migration 011 หนึ่งไฟล์ก่อนใช้หน้าเว็บชุดนี้:**

`supabase/migrations/20261121000011_budget_auto_replace_atomic.sql`

Migration ใช้ `CREATE OR REPLACE FUNCTION`, `REVOKE` และ `GRANT` จึงรันซ้ำได้ ไม่มีการลบ/แก้ข้อมูลขณะติดตั้ง และไม่เปลี่ยนตารางหรือ RLS เดิม

หลักฐาน Policy ที่ได้รับยังเป็น:

- SELECT: `is_trip_member(trip_id)`
- INSERT/UPDATE/DELETE: `can_edit_trip(trip_id)` สำหรับ `authenticated`

Migration 011 เรียก `can_edit_trip` ซ้ำก่อนทำงาน แต่ยังไม่ได้ตรวจเนื้อหาฟังก์ชันหรือทดสอบ Owner/Editor/Viewer จริงในสภาพแวดล้อมนี้ จึงไม่อ้างว่าบทบาทผ่านแล้ว

## ติดตั้งผ่าน GitHub และ Supabase บนเบราว์เซอร์

### 1. รัน Migration ใน Supabase

1. ดาวน์โหลดและแตก ZIP
2. เปิด `supabase/migrations/20261121000011_budget_auto_replace_atomic.sql`
3. คัดลอกทั้งหมดไป Supabase → SQL Editor → New query → Run
4. ต้องจบโดยไม่มี ERROR

### 2. อัปโหลดไฟล์ผ่าน GitHub

1. เปิด GitHub → Repository `thai77` → Branch ใหม่ เช่น `part-8-1c-budget-atomic`
2. อยู่ที่ **root ของ repo** ซึ่งเห็น `src`, `public`, `supabase`
3. กด **Add file → Upload files**
4. ลากโฟลเดอร์ **`src` ที่แตกจาก ZIP** ลงในกรอบอัปโหลด
   - ต้องลากจาก root; อย่าเข้า `src` ก่อน มิฉะนั้นอาจกลายเป็น `src/src`
   - อย่าลากไฟล์ `.zip` ขึ้นตรง ๆ
5. เพื่อเก็บ Migration/Test ใน Repository ให้ลากโฟลเดอร์ **`supabase`** ที่แตกจาก ZIP จากหน้า root เช่นกัน (ลากพร้อม `src` หรืออัปโหลดรอบที่สองก็ได้)
6. ตรวจให้เห็น 5 พาธในตาราง “ไฟล์ที่เพิ่ม/แทนที่” แล้ว Commit
7. เปิด Pull Request; รอ TypeScript/Unit/e2e เดิมผ่านก่อน Merge
8. หลัง deploy กดรีเฟรชไม่ใช้แคช (`Ctrl+Shift+R`)

`README_TH.md`, `TEST_REPORT.md`, `MANIFEST.sha256` ไม่จำเป็นต่อ Runtime

## วิธีทดสอบและผลที่ควรได้

### A. คำนวณสำเร็จและรักษา manual

1. มีรายการอัตโนมัติเดิมอย่างน้อย 2 รายการ และเพิ่มรายการ manual 1 รายการ
2. เปลี่ยน Timeline แล้วกด **คำนวณจากแผน → คำนวณ**
3. รีเฟรชหน้า

ผล: รายการอัตโนมัติเป็นชุดใหม่ครบ, รายการ manual ยังอยู่, สรุปหมวด/วัน/งบ/ผู้จ่ายตรงทั้งก่อนและหลังรีเฟรช

### B. SQL rollback เมื่อ INSERT ล้มเหลว

1. ต้องมี budget item อย่างน้อย 1 แถวที่สร้างโดย Owner/Editor
2. เปิด `supabase/tests/budget_atomic_replace.part8_1c.test.sql`
3. วางใน SQL Editor แล้ว Run

ผล: เห็น NOTICE `PART 8.1c ALL PASSED...` และสคริปต์จบด้วย `ROLLBACK`; ข้อมูลจริงไม่เปลี่ยน Test จงใจส่ง category id ที่ผิดหลัง DELETE แล้วตรวจว่าชุดอัตโนมัติก่อนหน้าใน transaction กลับมาครบ

ถ้าขึ้น `PART8_1C TEST SETUP` ให้สร้าง/คำนวณรายการงบ 1 รายการด้วย Owner/Editor แล้วรันใหม่ ไม่ต้องแก้ RLS

### C. เครือข่ายขาดช่วง

1. กดคำนวณ แล้วปิดเครือข่ายขณะกำลังส่ง/อ่านผล
2. เปิดเครือข่ายแล้วกด **ตรวจสอบอีกครั้ง**

ผล: ระบบไม่แจ้งสำเร็จจากการเดา; หลังตรวจจะแสดงชุดที่ฐานข้อมูลมีจริง ไม่เกิดสภาพเหลือเพียงบางรายการ

### D. คำนวณพร้อมกันสองแท็บ

1. เปิดทริปเดียวกันสองแท็บและเปลี่ยน Timeline ให้ต่างกัน
2. กดคำนวณใกล้กัน

ผล: แต่ละคำขอเป็นทั้งชุด ไม่มีชุดผสมกัน คำขอที่ commit ทีหลังเป็นชุดล่าสุด หน้าใดที่ตรวจพบชุดใหม่กว่าจะโหลดข้อมูลจริงและไม่อ้างว่าชุดเก่าสำเร็จ

### E. Regression Part 8.1a–8.1b

- แก้ยอด `125.50` และวันเวลาได้; เปิดซ้ำค่าตรง
- `-1` และ `1.999` ถูกปฏิเสธ; `0.00` บันทึกได้
- เงินแสดง 2 ตำแหน่ง
- แก้รายการอัตโนมัติแล้วเป็น manual และคำนวณใหม่ไม่ลบ
- ล้างยอดจริงเก็บค่าประมาณไว้
- ลบทั้งรายการและ Undo ภายใน 6 วินาที
- แก้พร้อมกันสองแท็บไม่เขียนทับ snapshot ใหม่

### F. Regression ที่ต้องรันใน Repository/Supabase จริง

- `npm run build` หรือ TypeScript command ของ Repository
- Vitest ทั้งหมด รวม `budgetApi.part8_1c.test.ts`
- RLS 86, Search 50, Share 87, Share Preview 29 ต้องไม่ลดและต้องผ่านเท่าเดิม
- Owner/Editor คำนวณ/แก้/ลบได้; Viewer และ anon เรียก RPC ไม่ได้จริง
- หน้าแชร์ไม่เปิดเผยงบ, Guest Mode, PWA ไม่แคชข้อมูลส่วนตัว, `.ics`
- Playwright/e2e และหน้าจอ 360px ทุกธีมที่เกี่ยวข้อง

รายละเอียดสิ่งที่ตรวจแล้วและยังไม่ได้ตรวจอยู่ใน `TEST_REPORT.md`
