-- RAHHAL live booking RPCs. Run after the initial schema and staff profile setup.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_booking(
  p_student_name text,
  p_student_phone text,
  p_university text,
  p_line_id uuid,
  p_pickup_point_id uuid,
  p_trip_date date,
  p_go_time time,
  p_return_time time,
  p_cancel_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_line public.lines%rowtype;
begin
  if length(trim(coalesce(p_student_name,''))) < 3 then raise exception 'اكتب الاسم بالكامل'; end if;
  if p_student_phone !~ '^01[0125][0-9]{8}$' then raise exception 'رقم الموبايل غير صحيح'; end if;
  if length(trim(coalesce(p_university,''))) = 0 then raise exception 'اختر الجامعة'; end if;
  if p_trip_date < current_date then raise exception 'لا يمكن الحجز في تاريخ سابق'; end if;
  if length(coalesce(p_cancel_token,'')) < 32 then raise exception 'رمز الإلغاء غير صالح'; end if;

  select * into v_line from public.lines where id=p_line_id and active=true;
  if not found then raise exception 'الخط غير متاح'; end if;
  if v_line.university <> p_university then raise exception 'الجامعة لا تطابق الخط المختار'; end if;
  if not exists(select 1 from public.pickup_points where id=p_pickup_point_id and line_id=p_line_id and visible_to_students=true) then
    raise exception 'نقطة التجمع غير متاحة لهذا الخط';
  end if;
  if not exists(select 1 from public.line_days where line_id=p_line_id and weekday=extract(dow from p_trip_date)::int and go_time=p_go_time and active=true and (return_time is not distinct from p_return_time)) then
    raise exception 'الموعد غير متاح في هذا اليوم';
  end if;

  insert into public.bookings(student_name,student_phone,university,line_id,pickup_point_id,trip_date,go_time,return_time,cancellation_token_hash)
  values(trim(p_student_name),trim(p_student_phone),trim(p_university),p_line_id,p_pickup_point_id,p_trip_date,p_go_time,p_return_time,encode(digest(convert_to(p_cancel_token,'UTF8'),'sha256'),'hex'))
  returning booking_code into v_code;

  return jsonb_build_object('booking_code',v_code,'status','booked');
end;
$$;

create or replace function public.cancel_booking(p_booking_code text,p_cancel_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if length(coalesce(p_cancel_token,'')) < 32 then raise exception 'رمز الإلغاء غير صالح'; end if;
  update public.bookings
  set status='cancelled',cancelled_at=now()
  where booking_code=p_booking_code
    and status='booked'
    and cancellation_token_hash=encode(digest(convert_to(p_cancel_token,'UTF8'),'sha256'),'hex')
  returning id into v_id;
  if v_id is null then raise exception 'الحجز غير موجود أو تم إلغاؤه بالفعل'; end if;
  return jsonb_build_object('booking_code',p_booking_code,'status','cancelled');
end;
$$;

revoke all on function public.create_booking(text,text,text,uuid,uuid,date,time,time,text) from public;
revoke all on function public.cancel_booking(text,text) from public;
grant execute on function public.create_booking(text,text,text,uuid,uuid,date,time,time,text) to anon, authenticated;
grant execute on function public.cancel_booking(text,text) to anon, authenticated;
