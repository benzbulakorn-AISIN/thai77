# Landmark 77 จังหวัด — วิธีติดตั้งและใช้งาน

ชุดนี้ผสานข้อมูล Landmark ที่ตรวจทานแล้วเข้ากับ schema เดิมของ Thai77 โดย **ไม่แทนที่** ตาราง `places`, `place_sources`, `place_images` และไม่ลบประวัติผู้ใช้

## ไฟล์สำคัญ

- `supabase/migrations/20261121000012_landmarks.sql` — เพิ่มฟิลด์ Landmark, คิวตรวจรูป, Candidate, ตราจังหวัดแบบ immutable, trigger และสถานะจังหวัด
- `supabase/seed_landmarks.sql` — นำเข้า Landmark หลักอันดับ 1 ครบ 77 จังหวัด, แหล่งข้อมูล 231 รายการ, คิว Commons 77 รายการ และ Candidate 48 รายการ
- `data/landmarks/` — ชุด CSV/JSON ต้นทางที่ได้รับการตรวจแล้ว
- หน้าเว็บ `#/admin/landmarks` — ตรวจ แก้ไขรูป และเผยแพร่ทีละจังหวัด

## ลำดับติดตั้งกับฐานข้อมูลจริง

1. สำรองฐานข้อมูลหรือ Export สถานที่เดิมจากหน้า Admin
2. Supabase → SQL Editor → วางและ Run `supabase/migrations/20261121000012_landmarks.sql`
3. วางและ Run `supabase/seed_landmarks.sql`
4. ตรวจผลที่หน้า `#/admin/landmarks` ต้องเห็น `77/77`
5. ตรวจข้อมูลรายแห่งในหน้าแก้ไข; เพิ่มพิกัด/ข้อมูลบริการเฉพาะที่ตรวจแหล่งทางการแล้ว
6. รูปจริง: เปิดลิงก์ค้นหา Commons → เลือก **หน้า File** → ใช้หน้าจัดการรูปเดิมของแอปเพื่อตรวจ author/license/attribution ก่อนเพิ่ม
7. ถ้ายังไม่มีรูปที่ผ่าน License ให้คงภาพปกอัตโนมัติ
8. เมื่อพร้อม กด **ยืนยันและเผยแพร่** ทีละจังหวัด

## สถานะเริ่มต้นหลัง Seed

ทุกรายการเริ่มเป็น:

- `verification = pending`
- `landmark_status = draft`
- `is_demo = false`
- `is_published = false`

ดังนั้นบุคคลทั่วไปจะยังไม่เห็น Landmark ใหม่จนกว่า Admin จะยืนยันเผยแพร่ ส่วน Admin เห็นได้ทันทีผ่าน RLS เดิม

## กติกา “ถึงแล้ว” และตราจังหวัด

- `กำลังจัดทำ Landmark` — จังหวัดยังไม่มี Landmark ที่ verified + published
- `ยังไม่เคยไป` — มี Landmark เผยแพร่แล้ว แต่ผู้ใช้ยังไม่มีประวัติไปในจังหวัด
- `เคยแวะ` — เคยบันทึกการไปสถานที่อื่นในจังหวัด แต่ยังไม่เคยไป Landmark ที่เผยแพร่
- `ถึงแล้ว` — เคยไป Landmark ที่เผยแพร่อย่างน้อย 1 แห่ง

เมื่อตราออกแล้ว ระบบเก็บ snapshot ใน `province_badges` และไม่มี policy ให้ผู้ใช้แก้ไข/ลบ จึงไม่ล้างตราอัตโนมัติหาก Admin เปลี่ยน Landmark ภายหลัง

## การผสานกับข้อมูล Demo เดิม

`seed_landmarks.sql` ใช้เฉพาะการจับคู่ **ชื่อไทยตรงกันทุกตัวอักษร + จังหวัดเดียวกัน** เพื่อรักษา `id` และประวัติผู้ใช้ของแถวเดิม ไม่มี fuzzy match หากไม่ตรงจะสร้างแถวใหม่อย่างปลอดภัย

แถวเดิมที่จับคู่ได้จะ:

- รักษาพิกัดและข้อมูลบริการเดิมที่มีอยู่
- เปลี่ยนเป็น `is_demo=false`
- เปลี่ยนเป็น `pending/draft/unpublished` เพื่อรอ Admin ยืนยันตามกติกา

## รูปภาพและลิขสิทธิ์

คิวค้นหารูปถูกเก็บใน `place_image_review_queue` แยกจาก `place_images` โดยตั้งใจ เพราะ URL ค้นหา Commons ยังไม่ใช่ไฟล์ที่ผ่านการตรวจ License และไม่ควรถูกแสดงเป็นรูปจริง

ระบบเดิมยังคงรับเฉพาะ:

- รูปใน Supabase Storage ที่ Admin อัปโหลด
- URL จาก `upload.wikimedia.org` ที่ผ่านตัวตรวจ Commons
- License เสรีที่รองรับ: CC0, Public domain, CC BY, CC BY-SA

## ตรวจหลังติดตั้ง

ใช้คำสั่งในเครื่องหรือ GitHub Actions:

```bash
npm ci
npm test
npm run build
npm run check:build
npm run check:secrets
```

จากนั้นทดสอบจริง:

- Admin เห็น 77 Landmark แต่ผู้ใช้ทั่วไปยังไม่เห็นก่อนเผยแพร่
- จังหวัดที่ยังไม่เผยแพร่แสดง “กำลังจัดทำ Landmark”
- หลังเผยแพร่ 1 จังหวัด หน้า Province แสดง Landmark หลัก
- บันทึกการไป Landmark แล้วได้สถานะ “ถึงแล้ว”
- ยกเลิกเผยแพร่หรือเปลี่ยน Landmark แล้วตราเดิมยังอยู่
