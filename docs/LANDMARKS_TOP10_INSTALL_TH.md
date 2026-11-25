# ติดตั้ง Top 10 Landmark ครบ 77 จังหวัด

วันที่จัดทำ: 24 พฤศจิกายน 2026

## ขอบเขต
- 77 จังหวัด × 10 รายการ = **770 Landmark**
- อันดับ 1 ของทุกจังหวัดรักษารายการเดิมจากชุด `Thai77_Landmark_Research.xlsx`
- อันดับ 2–10 เป็น shortlist เชิงแนะนำจากผลค้นหารายจังหวัดและชุดข้อมูลแหล่งท่องเที่ยวของ ททท.
- ใช้ภาพปกประกอบแบบ reusable จำนวน 770 ไฟล์ใน `public/landmark-covers/` ทุกภาพระบุชัดว่า **ไม่ใช่ภาพถ่ายสถานที่จริง**
- Migration จะตั้งสถานที่และ Landmark เป็น verified/published ตามคำสั่งให้นำเข้าทั้งชุดโดยไม่ต้องตรวจทีละจังหวัด ผู้ดูแลแก้ไขภายหลังได้

## ไฟล์สำคัญ
- `supabase/migrations/20261124000013_all_provinces_top10_landmarks.sql`
- `data/landmarks/all/thailand_top10_landmarks.csv`
- `data/landmarks/all/thailand_top10_landmarks.json`
- `data/landmarks/all/all_provinces_places_import.csv`
- `data/landmarks/all/all_provinces_landmark_link_manifest.json`
- `public/landmark-covers/` (770 JPG)

## วิธีติดตั้ง
1. สำรองฐานข้อมูล Supabase ก่อน
2. ให้ Migration 001–012 ถูกติดตั้งตามลำดับเดิม
3. เปิด Supabase SQL Editor และรัน `20261124000013_all_provinces_top10_landmarks.sql` หนึ่งครั้ง
4. อัปเดตโค้ดทั้งหมดและ Deploy เว็บ เพื่อให้หน้าแต่ละจังหวัดแสดงอันดับ 1–10 และภาพปกประกอบ
5. เปิดจังหวัดตัวอย่างอย่างน้อย 3 จังหวัดจากคนละภูมิภาค ตรวจว่ามี 10 รายการเรียง 1–10

Migration 013 ออกแบบให้รันซ้ำได้สำหรับชุดนี้: ใช้สถานที่เดิมเมื่อชื่อไทยตรงกันในจังหวัดเดียวกัน เพิ่มเฉพาะรายการที่ยังไม่มี และจัดอันดับของชุด Top 10 ให้ตรงกับข้อมูลล่าสุด

## ทางเลือก Import ผ่านหน้า Admin
หากไม่ต้องการรัน seed ส่วนข้อมูลใน Migration:
1. Admin → นำเข้า → `all_provinces_places_import.csv`
2. Admin → Landmark → `all_provinces_landmark_link_manifest.json`
3. Preview ต้องได้ทั้งหมด 770 รายการ และไม่มีอันดับซ้ำในจังหวัด

วิธีนี้นำเข้าแบบ pending ตาม workflow เดิม ส่วน Migration 013 คือวิธีอัตโนมัติที่เผยแพร่ทั้งชุดตามคำขอ

## การแก้ไขภายหลัง
- เปลี่ยนอันดับ/เหตุผล: Admin → Landmark
- แก้ชื่อ หมวด รายละเอียด หรือสถานะ: Admin → สถานที่
- หากต้องการใช้ภาพถ่ายจริง ให้แทนภาพประกอบด้วยไฟล์ที่ตรวจสิทธิ์แล้ว พร้อมผู้สร้าง สัญญาอนุญาต URL ต้นทาง และข้อความ attribution
