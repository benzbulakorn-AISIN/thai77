# Thai77 Landmark Seed — 77 จังหวัด

วันที่ตรวจข้อมูล: 2026-11-21

## สิ่งที่อยู่ในชุดส่งมอบ
- `places.csv/json`: Landmark หลักอันดับ 1 ครบ 77 จังหวัด (77 แถว)
- `place_sources.csv/json`: แหล่งข้อมูล 3 ระดับต่อสถานที่ (231 แถว)
- `place_images.csv/json`: คิวค้นหา/ตรวจรูป Wikimedia Commons 77 แถว ใช้ `auto_fallback` จนกว่าจะอนุมัติไฟล์จริง
- `admin_candidates.csv/json`: Candidate เปรียบเทียบสำหรับจังหวัดที่มีตัวเลือกใกล้เคียง
- `thai77_schema.sql`: โครงสร้าง Supabase/PostgreSQL, RLS ขั้นต้น, visit และ badge ledger
- `Thai77_Landmark_Research.xlsx`: workbook สำหรับตรวจทานและอนุมัติ

## สถานะความปลอดภัย
- ทุกแถวเป็น `verification_status=pending`, `landmark_status=draft`, `is_demo=false`, `is_published=false`
- ไม่ใส่พิกัด เวลาเปิด ค่าเข้า โทรศัพท์ หรือข้อมูลบริการที่ยังไม่ได้ตรวจรายแห่ง
- URL หน้า Attraction เป็น candidate สำหรับ Admin เปิดตรวจ ไม่ถือว่า verified
- แหล่งรูปที่อนุญาตคือ Wikimedia Commons เท่านั้น; ใส่ Commons MediaSearch URL ให้ครบทุกแห่ง แต่ยังไม่ผูกไฟล์จริงจนกว่าจะตรวจ File page, author, license และ attribution

## ลำดับงาน Admin ที่แนะนำ
1. ยืนยัน Landmark อันดับ 1 และ Candidate ในชีต `Admin_Candidates`
2. เปิด URL รายสถานที่และจับคู่ record ทางการ
3. ตรวจอำเภอ พิกัด และเงื่อนไขเข้าชมกับหน่วยงานผู้ดูแล
4. ตรวจ Commons file page, author, license, attribution และข้อจำกัดก่อนเปลี่ยน `cover_mode=actual`
5. เปลี่ยนสถานะเป็น verified/published ผ่าน workflow Admin เท่านั้น
