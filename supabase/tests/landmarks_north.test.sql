-- =====================================================================
-- Migration 012 Northern Landmark / RLS test (self-rollback)
-- Run after migrations 001-012 and seeds. The final ERROR is intentional.
-- Read the report in the error detail; it must end with ALL PASSED.
-- Existing suites rls.test.sql (86), search.test.sql (50),
-- share.test.sql (87), and share_preview.test.sql (29) are unchanged.
-- =====================================================================

begin;

create function public._lm_chk(n text, ok boolean) returns text language sql immutable as $$
  select (case when coalesce(ok, false) then 'PASS  ' else 'FAIL  ' end) || n
$$;
create function public._lm_count(q text) returns int language plpgsql as $$
declare n int; begin execute 'select count(*) from (' || q || ') s' into n; return n;
exception when others then return -1; end $$;
create function public._lm_dml(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n;
exception when others then return -1; end $$;
create function public._lm_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
end $$;
create function public._lm_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;
grant execute on function public._lm_chk(text,boolean), public._lm_count(text), public._lm_dml(text), public._lm_as(uuid), public._lm_anon() to anon, authenticated;

do $test$
declare
  u uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  reg uuid; prov uuid; cat uuid; place uuid; lm uuid;
  rep text := ''; total int; passed int; original_name text;
begin
  if to_regclass('public.province_landmarks') is null then raise exception 'Migration 012 is not installed'; end if;

  insert into auth.users(id,email,aud,role) values
    (u,'lm-user@example.invalid','authenticated','authenticated'),
    (adm,'lm-admin@example.invalid','authenticated','authenticated');
  update public.profiles set role='admin' where id=adm;
  insert into public.regions(code,name_th,name_en) values ('zzlm','ภาคทดสอบ Landmark','Landmark test') returning id into reg;
  insert into public.provinces(pcode,slug,name_th,name_en,region_id)
    values ('TH98','landmark-test','จังหวัดทดสอบ Landmark','Landmark Province',reg) returning id into prov;
  insert into public.categories(slug,name_th,name_en) values ('landmark-test','หมวดทดสอบ Landmark','Landmark test') returning id into cat;
  insert into public.places(name_th,province_id,category_id,verification,is_published)
    values ('สถานที่ Landmark ทดสอบ',prov,cat,'pending',false) returning id into place;

  perform public._lm_as(u);
  rep := rep || public._lm_chk('ผู้ใช้ทั่วไปสร้าง province_landmarks ตรง ๆ ไม่ได้',
    public._lm_dml(format('insert into public.province_landmarks(province_id,place_id,place_key,landmark_rank,landmark_reason_th) values (%L,%L,%L,1,%L)',prov,place,'ZZ-LM-01','เหตุผล')) <= 0) || E'\n';
  rep := rep || public._lm_chk('ผู้ใช้ทั่วไปเรียกฟังก์ชันเชื่อมไม่ได้',
    public._lm_dml(format('select public.admin_link_province_landmark(%L,%L,%L,1::smallint,%L,%L::jsonb,%L::jsonb)',
      place,'TH98','ZZ-LM-01','เหตุผล','[]','null')) <= 0) || E'\n';

  perform public._lm_as(adm);
  lm := public.admin_link_province_landmark(
    place,'TH98','ZZ-LM-01',1::smallint,'เหตุผล Landmark ทดสอบ',
    jsonb_build_array(jsonb_build_object(
      'source_url','https://example.invalid/source','source_name','แหล่งทดสอบ','source_type','other','checked_at','2026-11-22','note','บันทึกเดิม')),
    jsonb_build_object(
      'image_url','https://upload.wikimedia.org/example/test.jpg','commons_page_url','https://commons.wikimedia.org/wiki/File:Test.jpg',
      'license_code','CC BY-SA 4.0','author','Tester','image_status','license_verified_visual_pending',
      'temporary_cover_label','ภาพประกอบ','review_note','ยังไม่ตรวจเต็มขนาด')
  );
  rep := rep || public._lm_chk('Admin เชื่อม place_id จริงได้', lm is not null) || E'\n';
  rep := rep || public._lm_chk('การเชื่อมเริ่ม pending/is_published=false',
    exists(select 1 from public.province_landmarks where id=lm and status='pending' and not is_published)) || E'\n';
  rep := rep || public._lm_chk('การเชื่อมไม่แก้ verification/is_published ของ place',
    exists(select 1 from public.places where id=place and verification='pending' and not is_published)) || E'\n';
  rep := rep || public._lm_chk('เพิ่ม source ในตารางเดิม place_sources',
    (select count(*) from public.place_sources where place_id=place and source_url='https://example.invalid/source')=1) || E'\n';
  rep := rep || public._lm_chk('เก็บ metadata รูปใน place_images เดิมแต่ยังไม่ approved',
    exists(select 1 from public.place_images where place_id=place and review_key='ZZ-LM-01:cover:1'
      and image_status='license_verified_visual_pending' and cover_mode='auto_fallback')) || E'\n';
  rep := rep || public._lm_chk('ไม่ตั้งรูป Candidate เป็น cover_image_id',
    (select cover_image_id is null from public.places where id=place)) || E'\n';
  rep := rep || public._lm_chk('Admin เห็นแถว pending', public._lm_count(format('select 1 from public.province_landmarks where id=%L',lm))=1) || E'\n';

  perform public.admin_review_province_landmark(lm,1::smallint,'เหตุผลหลังตรวจ','pending','อนุมัติ Candidate แต่ยังไม่ Publish');
  rep := rep || public._lm_chk('อนุมัติ Candidate ยังคงไม่เผยแพร่',
    exists(select 1 from public.province_landmarks where id=lm and status='pending' and not is_published)) || E'\n';
  rep := rep || public._lm_chk('Publish ถูกปฏิเสธถ้า place ยังไม่ verified/published',
    public._lm_dml(format('select public.admin_publish_province_landmark(%L)',lm)) <= 0) || E'\n';
  rep := rep || public._lm_chk('เขียนตารางตรง ๆ ก็ข้าม publish guard ไม่ได้',
    public._lm_dml(format('update public.province_landmarks set status=''published'', is_published=true where id=%L',lm)) <= 0) || E'\n';

  perform public._lm_anon();
  rep := rep || public._lm_chk('anon ไม่เห็น Landmark pending', public._lm_count(format('select 1 from public.province_landmarks where id=%L',lm))=0) || E'\n';
  rep := rep || public._lm_chk('anon ไม่เห็น image metadata pending', public._lm_count(format('select 1 from public.place_images where place_id=%L',place))=0) || E'\n';

  perform public._lm_as(adm);
  update public.places set verification='verified',verified_at=current_date,is_published=true where id=place;
  perform public.admin_publish_province_landmark(lm);
  rep := rep || public._lm_chk('Admin เผยแพร่ Landmark ได้เมื่อ place พร้อม',
    exists(select 1 from public.province_landmarks where id=lm and status='published' and is_published)) || E'\n';

  perform public._lm_anon();
  rep := rep || public._lm_chk('anon เห็นเฉพาะ Landmark published', public._lm_count(format('select 1 from public.province_landmarks where id=%L',lm))=1) || E'\n';
  rep := rep || public._lm_chk('anon เห็น place ที่ยัง published', public._lm_count(format('select 1 from public.places where id=%L',place))=1) || E'\n';
  rep := rep || public._lm_chk('anon ยังไม่เห็น image Candidate pending แม้ Landmark เผยแพร่',
    public._lm_count(format('select 1 from public.place_images where place_id=%L',place))=0) || E'\n';

  perform public._lm_as(adm);
  insert into public.place_images(place_id,external_url,license,author,alt_th,image_status,cover_mode)
    values(place,'https://example.invalid/approved.jpg','own photo','Admin','ภาพที่ตรวจแล้ว','approved','actual');
  perform public._lm_anon();
  rep := rep || public._lm_chk('anon เห็นเฉพาะ image approved ของ place published',
    public._lm_count(format('select 1 from public.place_images where place_id=%L',place))=1) || E'\n';

  perform public._lm_as(u);
  rep := rep || public._lm_chk('ผู้ใช้ทั่วไปแก้ image pending เป็น approved ไม่ได้',
    public._lm_dml(format('update public.place_images set image_status=''approved'' where review_key=%L','ZZ-LM-01:cover:1')) <= 0) || E'\n';
  rep := rep || public._lm_chk('ผู้ใช้ทั่วไปแก้ Landmark ไม่ได้',
    public._lm_dml(format('update public.province_landmarks set landmark_rank=2 where id=%L',lm)) <= 0) || E'\n';

  perform public._lm_as(adm);
  update public.places set is_published=false where id=place;
  rep := rep || public._lm_chk('ปิด place แล้ว trigger ปิด Landmark อัตโนมัติ',
    exists(select 1 from public.province_landmarks where id=lm and status='pending' and not is_published)) || E'\n';
  perform public._lm_anon();
  rep := rep || public._lm_chk('anon ไม่เห็น Landmark เมื่อ place ถูกปิด', public._lm_count(format('select 1 from public.province_landmarks where id=%L',lm))=0) || E'\n';

  -- Re-link is idempotent and incoming blanks do not erase source metadata.
  perform public._lm_as(adm);
  select source_name into original_name from public.place_sources where place_id=place and source_url='https://example.invalid/source';
  perform public.admin_link_province_landmark(
    place,'98','ZZ-LM-01',1::smallint,'เหตุผลเชื่อมซ้ำ',
    jsonb_build_array(jsonb_build_object('source_url','https://example.invalid/source','source_name','','source_type','other','checked_at','2026-11-22')),
    jsonb_build_object('image_status','missing','temporary_cover_label','ภาพประกอบ')
  );
  rep := rep || public._lm_chk('รันเชื่อมซ้ำไม่สร้าง Landmark ซ้ำ', (select count(*) from public.province_landmarks where place_id=place)=1) || E'\n';
  rep := rep || public._lm_chk('รันเชื่อมซ้ำไม่สร้าง source ซ้ำ', (select count(*) from public.place_sources where place_id=place and source_url='https://example.invalid/source')=1) || E'\n';
  rep := rep || public._lm_chk('ค่าว่างไม่ทับ source_name เดิม',
    (select source_name from public.place_sources where place_id=place and source_url='https://example.invalid/source')=original_name) || E'\n';
  rep := rep || public._lm_chk('รันเชื่อมซ้ำไม่สร้าง image metadata ซ้ำ',
    (select count(*) from public.place_images where review_key='ZZ-LM-01:cover:1')=1) || E'\n';
  rep := rep || public._lm_chk('Migration นี้ไม่เพิ่ม trigger เปลี่ยนกติกาตราจังหวัด',
    not exists(select 1 from pg_trigger where tgname in ('trg_badge_from_place_status','trg_badge_from_visit','trg_backfill_badges_on_landmark_publish'))) || E'\n';

  reset role;
  rep := rep || public._lm_chk('province_landmarks เปิด RLS',
    (select rowsecurity from pg_tables where schemaname='public' and tablename='province_landmarks')) || E'\n';
  rep := rep || public._lm_chk('anon ไม่มีสิทธิ์เรียก RPC ฝั่ง Admin',
    not has_function_privilege('anon','public.admin_link_province_landmark(uuid,text,text,smallint,text,jsonb,jsonb)','execute')
    and not has_function_privilege('anon','public.admin_publish_province_landmark(uuid)','execute')) || E'\n';

  select count(*), count(*) filter(where line like 'PASS%') into total,passed
    from unnest(string_to_array(rep,E'\n')) line where line<>'';
  raise exception E'\n============= NORTH LANDMARK TEST REPORT =============\n%\n======================================================\n%',
    rep, case when passed=total then format('ALL PASSED %s/%s (rollback complete)',passed,total)
      else format('FAILED %s/%s — inspect FAIL lines',total-passed,total) end;
end
$test$;
