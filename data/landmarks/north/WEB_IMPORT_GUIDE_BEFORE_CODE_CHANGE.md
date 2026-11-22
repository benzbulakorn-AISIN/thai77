# คู่มือขั้นตอนถัดไป — Landmark ภาคเหนือหลังจับคู่ Export

> รอบนี้ **Preview แล้วกดยกเลิกเท่านั้น** ห้าม Import, ห้าม Publish และห้ามอัปโหลดรูป

## ใช้ไฟล์ใด

ใช้เฉพาะ `northern_places_import_preview.csv` ซึ่งมี **16 แถว** เท่านั้น

ห้ามเลือกไฟล์ต่อไปนี้ในหน้า Import:

- `northern_existing_matches_REFERENCE_DO_NOT_IMPORT.csv` — snapshot ของเดิม 2 แถว
- `northern_places_full18_DRY_RUN_ONLY.csv` — ใช้ทดสอบ logic เท่านั้น
- `northern_landmark_metadata_pending.csv` — importer places ไม่รองรับ
- `northern_sources_metadata_pending.csv` — มี source หลายรายการและ metadata ที่ importer ไม่รองรับ
- `northern_images_review_pending.csv` — importer places ไม่รองรับภาพ

## ขั้นตอน Preview 16 แถว

1. เปิด **Admin → นำเข้า CSV / JSON**
2. เลือก `northern_places_import_preview.csv`
3. เลือกโหมด **เพิ่มเฉพาะใหม่** เท่านั้น ห้ามเลือก “เพิ่ม + อัปเดต”
4. ตรวจว่าหน้า Preview แสดง **16 แถว, Error 0, คอลัมน์ไม่รู้จัก 0**
5. ตรวจแต่ละแถวว่ายังเป็น `pending`, `is_demo=no`, `is_published=no`
6. ถ้ามีแถวใดขึ้น “ซ้ำ” ให้เปิด “ของเดิม” และบันทึก UUID/ชื่อ/จังหวัดลง `northern_place_mapping_export.csv`; อย่านำเข้าแถวนั้น
7. สำหรับแถวที่ขึ้น “ใหม่” ให้ค้นใน **Admin → สถานที่** ด้วยชื่อไทย ชื่ออังกฤษ และ aliases ใน `northern_place_mapping_export.csv` ภายในจังหวัดเดียวกัน
8. ตรวจหมวดกับ **Admin → หมวดหมู่** ว่า 7 slug ที่ใช้ยัง active
9. ตรวจว่าพิกัดและ Google Maps ว่างทุกแถว เว้นแต่ Admin ยืนยันจุดทางเข้า/ศูนย์บริการในรอบใหม่
10. กด **ยกเลิก** หรือออกจากหน้า ห้ามกดปุ่มยืนยัน Import

## วิธีจัดการสองสถานที่ที่มีอยู่แล้ว

- วัดพระธาตุดอยสุเทพราชวรวิหาร — `b7cf4a41-440f-5930-805c-803304cfa2e3`
- อุทยานแห่งชาติดอยอินทนนท์ — `8b4978da-715e-5a35-8c17-24634c833aab`

ทั้งสองรายการไม่อยู่ใน Preview 16 แถว จึงไม่สร้างซ้ำและไม่ทับข้อมูลเดิม

อย่าใช้โหมด merge กับไฟล์ 18 แถวเดิม เพราะ importer จะเตรียม patch ที่รวม `short_description`, `address`, `website_url`, `verification`, `is_demo` และ `is_published` ซึ่งอาจเปลี่ยนค่าของเดิมโดยไม่ตั้งใจ แม้พิกัดว่างจะไม่ถูกส่งเป็น patch ก็ตาม หาก Admin ต้องการเปลี่ยนสองรายการนี้ ให้แก้ผ่านหน้าแก้ไขสถานที่เป็นงานแยก หลังตรวจค่าปัจจุบันทีละช่อง

## เงื่อนไขก่อน Import จริงในอนาคต

ต้องผ่านครบทุกข้อ:

1. ตรวจ 16 ชื่อ/ชื่ออังกฤษ/aliases ในหน้า Admin สถานที่แล้วว่าไม่ซ้ำจริง
2. ยืนยันว่า Export ที่ใช้ครอบคลุม environment และ scope ที่ต้องการ หรือใช้ Export ใหม่ที่ยืนยันว่าไม่ถูกกรอง
3. ยืนยัน active category สำหรับ `temple`, `national-park`, `nature`, `culture`, `community`, `cave`, `dam`
4. ตรวจจังหวัดและอำเภอครบ 16 แถว
5. ยืนยัน `verification=pending`, `is_demo=no`, `is_published=no`
6. อนุมัติจุดทางเข้า/ศูนย์บริการก่อนกรอกพิกัด; ถ้ายังไม่อนุมัติให้ว่าง
7. ตัดสินใจ schema/API สำหรับ Landmark metadata และ source หลายรายการ หรือยอมรับอย่างชัดเจนว่าจะ Import เฉพาะ places
8. ตรวจ migration/schema จริง โดยเฉพาะไฟล์ init/RLS/storage ที่ README อ้างถึงแต่ไม่อยู่ใน snapshot
9. รูปยังใช้ AutoCover; ห้ามอัปโหลด Candidate จนกว่าจะตรวจไบนารีเต็มขนาดและอนุมัติ License/เครดิต/alt
10. ก่อน Import จริงให้ Export ใหม่เป็น snapshot และแบ่ง batch เล็กตามจังหวัด; หลังแต่ละ batch Export ซ้ำแล้วเทียบจำนวน สถานะ และ UUID

## การรักษาอันดับและ metadata

อันดับครบ 18 แห่งอยู่ใน `northern_landmark_metadata_pending.csv` และไม่ได้ถูกลดเหลือ 16 แห่ง เพียงแต่ places Preview ตัดสองสถานที่เดิมออก

แพร่คงลำดับที่ยืนยัน:

1. วัดพระธาตุช่อแฮ พระอารามหลวง
2. วนอุทยานแพะเมืองผี

อย่านำ metadata Landmark เข้า places importer จนกว่าจะมี schema/API รองรับและมีวิธีผูก `export_place_id`/place ID ที่ Admin ยืนยันแล้ว
