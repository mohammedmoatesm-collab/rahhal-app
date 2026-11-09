-- Atomic route setup: allow any authenticated staff member to create a line
-- with different schedules per weekday and timed pickup points.
create or replace function public.create_line_setup(
  p_name text,
  p_university text,
  p_supervisor_name text,
  p_supervisor_phone text,
  p_days jsonb,
  p_stops jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_id uuid;
  v_item jsonb;
begin
  if not public.is_staff() then
    raise exception 'غير مسموح: يجب تسجيل الدخول بحساب مدير معتمد';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'اكتب اسم الخط'; end if;
  if length(trim(coalesce(p_university,''))) = 0 then raise exception 'اختر الجامعة'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'حدد يوم تشغيل واحدًا على الأقل مع مواعيده';
  end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'أضف نقطة تجمع واحدة على الأقل';
  end if;

  insert into public.lines(name,university,supervisor_name,supervisor_phone,active)
  values(trim(p_name),trim(p_university),nullif(trim(coalesce(p_supervisor_name,'')),''),nullif(trim(coalesce(p_supervisor_phone,'')),''),true)
  returning id into v_line_id;

  for v_item in select value from jsonb_array_elements(p_days) loop
    if (v_item->>'weekday')::int not between 0 and 6 then raise exception 'يوم تشغيل غير صحيح'; end if;
    insert into public.line_days(line_id,weekday,go_time,return_time,active)
    values(v_line_id,(v_item->>'weekday')::int,(v_item->>'go_time')::time,nullif(v_item->>'return_time','')::time,true);
  end loop;

  for v_item in select value from jsonb_array_elements(p_stops) with ordinality as x(value, ordinality) order by ordinality loop
    if length(trim(coalesce(v_item->>'name',''))) = 0 then continue; end if;
    insert into public.pickup_points(line_id,name,arrival_time,sort_order,visible_to_students)
    values(v_line_id,trim(v_item->>'name'),nullif(v_item->>'arrival_time','')::time,(v_item->>'sort_order')::int,true);
  end loop;

  if not exists(select 1 from public.pickup_points where line_id=v_line_id) then
    raise exception 'أضف نقطة تجمع صحيحة واحدة على الأقل';
  end if;
  return v_line_id;
end;
$$;

revoke all on function public.create_line_setup(text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.create_line_setup(text,text,text,text,jsonb,jsonb) to authenticated;
