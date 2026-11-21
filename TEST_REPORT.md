# ผลตรวจ Part 8.1b

วันที่จัดทำ: 21 พฤศจิกายน 2026

## ฐานที่ใช้ (ตรวจแล้ว)

- ดาวน์โหลด `thai77-part8.1a-budget-edit-20261121.zip` จากไฟล์ผล Part 8.1a
- SHA-256 ของ ZIP: `b19fad160881e5f9bced551de656f7ac0dfb475176064e01782189471f72bfb2` ตรงกับรายงาน Part 8.1a
- `unzip -t`: ผ่าน ไม่มีไฟล์เสีย
- `sha256sum -c MANIFEST.sha256`: ไฟล์ฐาน 8 ไฟล์ผ่านทั้งหมด

## ทดสอบแล้วในสภาพแวดล้อมนี้

### 1. TypeScript แบบแยกส่วน (ผ่าน)

- TypeScript 6.0.2
- ตรวจ Production และ Unit Test ของ 8.1a + 8.1b ด้วย `strict: true`, `noEmit: true`
- ใช้ stub เฉพาะ dependency ของ Repository ที่ไม่ได้รับมา เช่น React, component, Supabase client และ type ของทริป
- ผล: `PASS isolated TypeScript strict check (production + tests)`

**ข้อจำกัด:** เป็น isolated type-check ไม่ใช่ `npm run build` ของ Repository จริง จึงไม่อ้างว่า Build จริงผ่าน

### 2. Runtime assertions แบบแยกส่วน (ผ่าน 26 assertions)

รันโค้ดจริงที่ compile จาก `calc.ts`, `pendingBudgetAction.ts` และ `budgetApi.ts` ครอบคลุม:

- Validation เงิน/สตางค์/วันเวลาและ summary เดิมของ 8.1a
- Undo 6 วินาที
- ล้างเฉพาะ `actual`, `paid_by`, `spent_at` โดยเก็บแถวและ `estimated`
- Undo คืน snapshot เดิม
- ลบซ่อนแถวและ Undo คืนแถว
- ตรวจสภาพฐานข้อมูลของ clear/delete
- API clear ส่งเฉพาะฟิลด์ยอดจริงเป็น null และ match ค่าเดิม
- API clear/delete อ่านฐานข้อมูลซ้ำก่อนสำเร็จ
- DELETE match snapshot ทั้งแถว
- ปฏิเสธกรณีแถวเปลี่ยนพร้อมกัน

ผล: `PASS 26 isolated runtime assertions`

### 3. จงใจทำให้ผิดเพื่อพิสูจน์ว่าชุดตรวจจับได้ (ผ่าน)

- ทำสำเนาชั่วคราวนอก ZIP
- จงใจเปลี่ยน `BUDGET_UNDO_MS` จาก `6_000` เป็น `5_000`
- รัน assertions ชุดเดิม
- ผล: หยุดด้วย exit code 1 ที่ `six-second undo` (`5000 !== 6000`) ตามที่คาด
- ตรวจไฟล์ส่งมอบแล้วว่ายังเป็น `6_000`; mutant ไม่ได้รวมใน ZIP

### 4. ตรวจขอบเขต (ผ่าน)

- ไม่เพิ่มหรือแก้ SQL/Migration/RLS
- ไม่ลดหรือแก้ test เดิมของ 8.1a
- ไม่ทำ Part 8.1c เรื่องแทนที่ประมาณการแบบ atomic
- ไม่แก้หน้าแชร์, Guest Mode, PWA, `.ics` หรือฟีเจอร์นอกหน้างบ
- เก็บ `calc.ts` และ test ของ 8.1a จากฐานล่าสุดไว้ใน ZIP

## Unit Test ที่เพิ่ม

- `pendingBudgetAction.test.ts`: 6 cases เรื่อง Undo, clear/delete optimistic state, restore และ DB-result verification
- `budgetApi.part8_1b.test.ts`: 6 cases เรื่อง clear/delete, re-read verification และ conflict จากการแก้พร้อมกัน

เมื่อรวม test ของ 8.1a ที่คงไว้ มีไฟล์ Unit Test 4 ไฟล์ใน ZIP

## เพิ่มไว้แล้ว แต่ยังไม่ได้รันด้วย Vitest จริง

Vitest ไม่ได้ติดตั้งใน Container และ Registry ที่สภาพแวดล้อมอนุญาตตอบ HTTP 403 จึงไม่ได้อ้างว่า Vitest จริงผ่าน แม้ test source จะผ่าน isolated TypeScript และตรรกะหลักผ่าน runtime assertions แล้ว

## ยังไม่ได้ทดสอบ

- Build/TypeScript ของ Repository จริง เพราะไม่มี Repository และ dependency ทั้งชุด
- Vitest จริงของโปรเจกต์
- React component test / Playwright และหน้าจอจริง 360px
- Supabase จริง รวมเครือข่ายขาดกลางคำสั่งและการทำงานพร้อมกัน 2 session
- Owner/Editor/Viewer และเนื้อหา `is_trip_member` / `can_edit_trip`
- RLS 86, Search 50, Share 87, Share Preview 29
- Regression จริงของหน้าแชร์ที่ไม่เปิดเผยงบ, Guest Mode, PWA ที่ไม่แคชข้อมูลส่วนตัว และ `.ics`
- GitHub Pages deployment

ต้องรันรายการเหล่านี้ใน Repository/Supabase จริงตาม `README_TH.md` ก่อน Merge เข้า `main`
