-- =====================================================================
-- Migration 010: ดูตัวอย่าง "สิ่งที่ผู้ดูจะเห็น" ก่อนสร้างลิงก์จริง
--
-- วิธีทำ: preview_trip_share() สร้างลิงก์แชร์จริงชั่วคราวด้วย create_trip_share() แล้วเรียก
--   get_shared_trip() กับ token นั้น จากนั้น "ย้อนกลับ" (ROLLBACK) การสร้างลิงก์ทิ้ง
--   => ตัวอย่างตรงกับสิ่งที่ผู้ดูเห็นจริงทุกประการ เพราะใช้ฟังก์ชันตัวเดียวกัน
--      (ไม่ได้เขียนกฎการซ่อนข้อมูลซ้ำไว้ที่ฝั่งหน้าเว็บ จึงไม่มีทางเพี้ยนจากของจริง)
--   * ไม่เหลือแถวใด ๆ ใน trip_shares และไม่นับในโควตา 5 ลิงก์
--   * เฉพาะเจ้าของทริปเรียกได้ (กฎและข้อความ error เดียวกับ create_trip_share)
--   * ไม่แก้ฟังก์ชัน 009 ที่ผ่านการทดสอบบน Supabase จริงแล้ว
--   * ถ้ามีลิงก์ที่ใช้งานอยู่ครบ 5 ลิงก์ ตัวอย่างจะ error 54000 เหมือนการสร้างลิงก์ (ต้องปิดลิงก์เก่าก่อน)
-- รันซ้ำได้โดยไม่เสียหาย
-- =====================================================================

create or replace function public.preview_trip_share(
  p_trip               uuid,
  p_display_name       text    default null,
  p_sharer_name        text    default null,
  p_message            text    default null,
  p_expires_days       integer default 30,
  p_show_dates         boolean default true,
  p_show_lodging_names boolean default false,
  p_show_custom_titles boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row    public.trip_shares;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_trip is null or not public.is_trip_owner(p_trip) then
    raise exception 'only the trip owner can preview this share' using errcode = '42501';
  end if;

  begin
    select * into v_row from public.create_trip_share(
      p_trip, p_display_name, p_sharer_name, p_message, p_expires_days,
      p_show_dates, p_show_lodging_names, p_show_custom_titles);
    v_result := public.get_shared_trip(v_row.token);
    -- เจตนา: ยกเลิก sub-transaction นี้ เพื่อให้การสร้างลิงก์ข้างบนถูกย้อนกลับ (variable v_result ยังอยู่)
    raise exception 'preview rollback' using errcode = 'SH001';
  exception
    when sqlstate 'SH001' then
      return v_result;
  end;
end
$$;

revoke all on function public.preview_trip_share(uuid, text, text, text, integer, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.preview_trip_share(uuid, text, text, text, integer, boolean, boolean, boolean) to authenticated;

comment on function public.preview_trip_share(uuid, text, text, text, integer, boolean, boolean, boolean)
  is 'ตัวอย่างที่ผู้ดูจะเห็น: สร้างลิงก์ชั่วคราว → get_shared_trip → ROLLBACK (ไม่เหลือแถวใน trip_shares)';

-- ให้ PostgREST (Supabase API) รู้จักฟังก์ชันใหม่ทันที
notify pgrst, 'reload schema';
