# ผลตรวจ Part 8.1a

วันที่จัดทำ: 21 พฤศจิกายน 2026

## ทดสอบแล้วในสภาพแวดล้อมนี้

### 1. TypeScript แบบแยกส่วน (ผ่าน)

- ใช้ TypeScript 6.0.2
- ตรวจไฟล์ Production ที่แก้ทั้ง 4 ไฟล์ด้วย `strict: true`, `noImplicitAny: false`, `noEmit: true`
- ตรวจไฟล์ Production และไฟล์ Vitest ทั้ง 2 ไฟล์ร่วมกัน
- ใช้ stub เฉพาะ dependency ของโปรเจกต์ที่ไม่ได้รับมา เช่น React component, Supabase client และ type ของทริป
- ผล: ผ่าน ไม่มี TypeScript diagnostic

**ข้อจำกัด:** นี่เป็น isolated type-check ไม่ใช่ `npm run build` ของ Repository จริง จึงไม่อ้างว่า Build จริงผ่าน

### 2. Runtime assertions แบบแยกส่วน (ผ่าน 18 assertions)

ตรวจฟังก์ชันจริงจาก `calc.ts` และ `budgetApi.ts` หลัง compile ได้แก่:

- รับ `0`, `125.50`, `฿1,234.56` และ `.5`
- ปฏิเสธค่าติดลบและทศนิยม 3 ตำแหน่ง
- แยกค่าว่างออกจากเลขศูนย์
- แสดงเงิน 2 ตำแหน่งโดยไม่ปัดเป็นบาทเต็ม
- แปลงวัน/เวลาระหว่าง `datetime-local` และ ISO แล้ว round-trip ได้
- รักษาผลสรุป estimated/actual/expected/remaining ที่มีสตางค์
- `updateBudgetItem` รับแถวที่ API ยืนยันแล้ว
- `updateBudgetItem` ปฏิเสธเมื่อจำนวนเงินที่ API ส่งกลับไม่ตรงกับค่าที่ขอบันทึก

ผล: `PASS 18 isolated runtime assertions`

### 3. จงใจทำให้ผิดเพื่อพิสูจน์ว่าชุดตรวจจับได้ (ผ่าน)

- สร้างสำเนาชั่วคราวของ `calc.ts`
- จงใจเปลี่ยน Validation จากรับทศนิยมไม่เกิน 2 ตำแหน่ง เป็นรับได้ 3 ตำแหน่ง
- รัน assertions เดิม
- ผล: ชุดทดสอบหยุดด้วย exit code 1 ที่กรณี `1.999` ตามที่คาด
- คืนไฟล์ส่งมอบเป็นโค้ดที่ถูกต้องแล้ว สำเนาที่ทำให้ผิดไม่รวมอยู่ใน ZIP

### 4. ตรวจขอบเขตไฟล์ (ผ่าน)

- ไม่เพิ่มหรือเปลี่ยน SQL/Migration/RLS
- ไม่แก้โค้ดลบ/Undo (Part 8.1b)
- ไม่แก้ `replaceAutoRows` ให้เป็น atomic (Part 8.1c)
- ไม่แก้หน้าแชร์, Guest Mode, PWA หรือปฏิทิน `.ics`

## เพิ่มไว้แล้ว แต่ยังไม่ได้รันใน Vitest จริง

เพิ่ม Unit Test 2 ไฟล์ รวม 22 cases เมื่อ Vitest ขยาย `it.each`:

- `part8_1a.test.ts`: Validation เงิน, การแสดงสตางค์, สรุปเดิม และวัน/เวลา
- `budgetApi.part8_1a.test.ts`: API ส่งแถวกลับถูกต้อง, ไม่พบแถว/RLS, ค่าที่ตอบกลับไม่ตรง และ `is_auto` ยังไม่เปลี่ยน

Vitest ไม่ได้ติดตั้งใน Container นี้ และ Registry ที่สภาพแวดล้อมอนุญาตตอบ 403 จึงไม่อ้างว่า Vitest จริงผ่าน

## ยังไม่ได้ทดสอบ

- `npm run build` / TypeScript ของ Repository จริง เพราะไม่ได้รับ Repository และ dependency ทั้งชุด
- Vitest จริงของโปรเจกต์
- Supabase จริง: INSERT/UPDATE, รูปแบบ timestamp, Owner/Editor/Viewer และเนื้อหา `is_trip_member` / `can_edit_trip`
- RLS 86, Search 50, Share 87, Share Preview 29
- e2e Playwright และหน้าจอจริงที่ความกว้าง 360px
- Regression จริงของแชร์ทริปที่ไม่เปิดเผยงบ, Guest Mode, PWA ที่ไม่แคชข้อมูลส่วนตัว และ `.ics`
- Deployment บน GitHub Pages

ต้องรันรายการเหล่านี้ใน Repository/ Supabase จริงตามขั้นตอนใน `README_TH.md` ก่อน Merge เข้า `main`
