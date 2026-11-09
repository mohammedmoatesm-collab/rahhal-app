-- Super-admin tools for managing additional manager accounts.
create or replace function public.list_staff_members()
returns table(user_id uuid, full_name text, role text, email text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'غير مسموح: هذه الخاصية للمدير الرئيسي فقط';
  end if;
  return query
    select p.user_id, p.full_name, p.role::text, u.email::text
    from public.staff_profiles p
    join auth.users u on u.id = p.user_id
    order by p.created_at;
end;
$$;

create or replace function public.add_manager_by_email(p_email text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'غير مسموح: إضافة المديرين للمدير الرئيسي فقط';
  end if;
  if length(trim(coalesce(p_full_name,''))) < 3 or position('@' in coalesce(p_email,'')) < 2 then
    raise exception 'اكتب اسم المدير وبريده الإلكتروني بشكل صحيح';
  end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'الحساب غير موجود. أنشئ/ادعُ المستخدم أولًا من Supabase Authentication ثم أضفه هنا';
  end if;
  if exists(select 1 from public.staff_profiles where user_id=v_user_id and role='super_admin') then
    raise exception 'هذا الحساب هو المدير الرئيسي بالفعل';
  end if;
  insert into public.staff_profiles(user_id,full_name,role)
  values(v_user_id,trim(p_full_name),'manager')
  on conflict(user_id) do update set full_name=excluded.full_name, role='manager';
  return v_user_id;
end;
$$;

create or replace function public.remove_manager(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'غير مسموح: حذف المديرين للمدير الرئيسي فقط';
  end if;
  if p_user_id=auth.uid() then
    raise exception 'لا يمكنك حذف صلاحية حسابك الحالي';
  end if;
  delete from public.staff_profiles where user_id=p_user_id and role='manager';
  return found;
end;
$$;

revoke all on function public.list_staff_members() from public;
revoke all on function public.add_manager_by_email(text,text) from public;
revoke all on function public.remove_manager(uuid) from public;
grant execute on function public.list_staff_members() to authenticated;
grant execute on function public.add_manager_by_email(text,text) to authenticated;
grant execute on function public.remove_manager(uuid) to authenticated;
