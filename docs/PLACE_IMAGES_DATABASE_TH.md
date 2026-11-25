# ระบบรูปสถานที่แบบตรวจล่วงหน้า (Supabase)

ระบบหน้าเว็บอ่านรูปจากตาราง `public.place_images` เท่านั้น ไม่ค้น Wikipedia, Wikidata หรือ Wikimedia Commons ตอนผู้ใช้เปิดหน้าเว็บอีกต่อไป

## ติดตั้ง

1. เปิด Supabase Dashboard ของโปรเจกต์
2. ไปที่ **SQL Editor**
3. เปิดไฟล์ `supabase/migrations/20261125000013_reviewed_place_images.sql`
4. รันไฟล์ทั้งชุดหนึ่งครั้ง
5. Deploy โค้ดหน้าเว็บชุดนี้

> ต้องรัน Migration ก่อน Deploy เพราะโค้ดใหม่กรองคอลัมน์ `review_status='approved'`

Migration นี้ทำงานแบบ idempotent และเริ่มต้นด้วยรูปที่ตรวจแล้ว 3 แห่งในชลบุรี:

- สวนนงนุชพัทยา
- หาดบางแสน
- หาดจอมเทียน

ข้อมูลเดียวกันอยู่ใน `data/place_images_reviewed.csv` เพื่อให้ตรวจทานง่าย

## กติกาก่อนอนุมัติ URL ใหม่

1. เปิดหน้า **Wikimedia Commons File** ของรูป ไม่ใช้หน้าผลค้นหา
2. ยืนยันว่าคำอธิบาย/พิกัด/หมวดหมู่ตรงกับสถานที่จริง
3. บันทึก Direct URL จาก `upload.wikimedia.org` หรือ `thumb.wikimedia.org`
4. บันทึก `author`, `license`, `source_url` และคำอธิบายไทย (`alt_th`)
5. ตั้ง `review_status='approved'` และ `reviewed_at=now()` เมื่อ Admin ตรวจครบแล้วเท่านั้น
6. หากยังไม่แน่ใจ ให้ใช้ `pending`; RLS และหน้าเว็บจะไม่แสดงแถวนั้น

## ตัวอย่างเพิ่มรูปที่ตรวจแล้ว

```sql
insert into public.place_images (
  place_id,
  external_url,
  license,
  author,
  source_url,
  alt_th,
  sort_order,
  review_status,
  reviewed_at,
  review_note
)
select
  p.id,
  'https://upload.wikimedia.org/wikipedia/commons/.../example.jpg',
  'CC BY-SA 4.0',
  'ชื่อผู้สร้าง',
  'https://commons.wikimedia.org/wiki/File:Example.jpg',
  'คำอธิบายรูปภาษาไทย',
  0,
  'approved',
  now(),
  'Admin ตรวจชื่อสถานที่ ผู้สร้าง และใบอนุญาตแล้ว'
from public.places p
join public.provinces pv on pv.id = p.province_id
where pv.slug = 'province-slug'
  and p.name_th = 'ชื่อสถานที่'
on conflict (place_id, external_url) where external_url is not null
do update set
  license = excluded.license,
  author = excluded.author,
  source_url = excluded.source_url,
  alt_th = excluded.alt_th,
  review_status = excluded.review_status,
  reviewed_at = excluded.reviewed_at,
  review_note = excluded.review_note,
  updated_at = now();
```

หากต้องการกำหนดเป็นรูปปก ให้ตั้ง `places.cover_image_id` เป็น `id` ของรูปนั้น ระบบจะยังเลือกภาพลำดับแรกเมื่อยังไม่ได้กำหนดรูปปก

## ผลต่อหน้าเว็บ

- หน้า Province และรายการสถานที่เรียก Supabase เป็นชุดตาม `place_id`
- หน้ารายละเอียดอ่านรูปจาก Supabase เพียงแหล่งเดียว
- ถ้าไม่มีรูปที่อนุมัติ ระบบใช้ภาพประกอบเดิมทันที
- ไม่มี request ไป `wikipedia.org`, `wikidata.org` หรือ `commons.wikimedia.org/w/api.php` ตอนเปิดหน้าเว็บ
- เครดิตและลิงก์แหล่งที่มายังคงแสดงจากค่าที่บันทึกไว้ในตาราง
