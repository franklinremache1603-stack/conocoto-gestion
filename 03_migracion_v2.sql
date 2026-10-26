-- Conocoto v2 · ejecutar una sola vez en Supabase SQL Editor, después del esquema 01.
-- Compatible con instalaciones ya existentes. No se eliminan órdenes ni históricos.
-- Autorizar exclusivamente a usuarios autenticados y habilitados en public.members.

alter table public.orders add column if not exists area_name text not null default '';
alter table public.orders add column if not exists pm_activity text not null default '';
alter table public.orders add column if not exists source_workplace text not null default '';
alter table public.orders add column if not exists source_user_status text not null default '';
alter table public.orders add column if not exists source_system_status text not null default '';
alter table public.orders add column if not exists source_extreme_start date;
alter table public.orders add column if not exists source_extreme_end date;
alter table public.orders add column if not exists source_execution_date date;
alter table public.orders add column if not exists source_priority text not null default '';
alter table public.orders add column if not exists start_date date;
alter table public.orders add column if not exists end_date date;
alter table public.orders add column if not exists planned_date date;
alter table public.orders add column if not exists route_group text not null default '';
create index if not exists idx_orders_pm_activity on public.orders(pm_activity);
create index if not exists idx_orders_district_address on public.orders(sector,address);

alter table public.work_logs add column if not exists old_start_date date;
alter table public.work_logs add column if not exists new_start_date date;
alter table public.work_logs add column if not exists old_end_date date;
alter table public.work_logs add column if not exists new_end_date date;
alter table public.work_logs add column if not exists old_planned_date date;
alter table public.work_logs add column if not exists new_planned_date date;
alter table public.work_logs add column if not exists old_route_group text;
alter table public.work_logs add column if not exists new_route_group text;

create or replace function public.ingest_order_batch(
  p_import_id uuid, p_cut_date date, p_rows jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare r jsonb; v_id text; v_cls text; v_cnt integer := 0;
begin
  if not public.is_conocoto_member() then raise exception 'Usuario no autorizado'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)>300 then
    raise exception 'Se requiere un lote de máximo 300 registros'; end if;
  if not exists(select 1 from public.imports where id=p_import_id
    and uploaded_by=auth.uid() and cut_date=p_cut_date and status='procesando') then
    raise exception 'Corte no encontrado o no autorizado'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_id := left(btrim(coalesce(r->>'order_no','')),70);
    v_cls := upper(btrim(coalesce(r->>'class_code','SIN CLASE')));
    if v_id='' or v_cls in ('DC01','CADE','RC01','EMER') then continue; end if;
    insert into public.orders (
      order_no,class_code,created_date,account_no,sector,address,customer,description,
      source_state,area_name,pm_activity,source_workplace,source_user_status,source_system_status,
      source_extreme_start,source_extreme_end,source_execution_date,source_priority,
      first_seen_date,last_seen_date)
    values (
      v_id,left(v_cls,24),nullif(r->>'created_date','')::date,
      left(coalesce(r->>'account_no',''),80),left(coalesce(r->>'sector',''),160),
      left(coalesce(r->>'address',''),250),left(coalesce(r->>'customer',''),160),
      left(coalesce(r->>'description',''),500),left(coalesce(r->>'source_state',''),100),
      left(coalesce(r->>'area_name',''),160),left(coalesce(r->>'pm_activity',''),220),
      left(coalesce(r->>'source_workplace',''),100),left(coalesce(r->>'source_user_status',''),100),
      left(coalesce(r->>'source_system_status',''),100),
      nullif(r->>'source_extreme_start','')::date,nullif(r->>'source_extreme_end','')::date,
      nullif(r->>'source_execution_date','')::date,left(coalesce(r->>'source_priority',''),100),
      p_cut_date,p_cut_date)
    on conflict (order_no) do update set
      class_code=case when p_cut_date>=public.orders.last_seen_date then excluded.class_code else public.orders.class_code end,
      created_date=coalesce(excluded.created_date,public.orders.created_date),
      account_no=case when p_cut_date>=public.orders.last_seen_date and excluded.account_no<>'' then excluded.account_no else public.orders.account_no end,
      sector=case when p_cut_date>=public.orders.last_seen_date and excluded.sector<>'' then excluded.sector else public.orders.sector end,
      address=case when p_cut_date>=public.orders.last_seen_date and excluded.address<>'' then excluded.address else public.orders.address end,
      customer=case when p_cut_date>=public.orders.last_seen_date and excluded.customer<>'' then excluded.customer else public.orders.customer end,
      description=case when p_cut_date>=public.orders.last_seen_date and excluded.description<>'' then excluded.description else public.orders.description end,
      source_state=case when p_cut_date>=public.orders.last_seen_date then excluded.source_state else public.orders.source_state end,
      area_name=case when p_cut_date>=public.orders.last_seen_date then excluded.area_name else public.orders.area_name end,
      pm_activity=case when p_cut_date>=public.orders.last_seen_date then excluded.pm_activity else public.orders.pm_activity end,
      source_workplace=case when p_cut_date>=public.orders.last_seen_date then excluded.source_workplace else public.orders.source_workplace end,
      source_user_status=case when p_cut_date>=public.orders.last_seen_date then excluded.source_user_status else public.orders.source_user_status end,
      source_system_status=case when p_cut_date>=public.orders.last_seen_date then excluded.source_system_status else public.orders.source_system_status end,
      source_extreme_start=case when p_cut_date>=public.orders.last_seen_date then excluded.source_extreme_start else public.orders.source_extreme_start end,
      source_extreme_end=case when p_cut_date>=public.orders.last_seen_date then excluded.source_extreme_end else public.orders.source_extreme_end end,
      source_execution_date=case when p_cut_date>=public.orders.last_seen_date then excluded.source_execution_date else public.orders.source_execution_date end,
      source_priority=case when p_cut_date>=public.orders.last_seen_date then excluded.source_priority else public.orders.source_priority end,
      first_seen_date=least(public.orders.first_seen_date,excluded.first_seen_date),
      last_seen_date=greatest(public.orders.last_seen_date,excluded.last_seen_date);
    insert into public.import_lines(import_id,order_no) values(p_import_id,v_id) on conflict do nothing;
    v_cnt := v_cnt+1;
  end loop;
  return v_cnt;
end;
$$;

create or replace function public.update_order_management_v2(
  p_order_no text,p_status text,p_assigned_to text,p_due_date date,p_notes text,
  p_start_date date,p_end_date date,p_planned_date date,p_route_group text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_conocoto_member() then raise exception 'Usuario no autorizado'; end if;
  if p_status not in ('PENDIENTE','EN_GESTION','ATENDIDA','NO_EJECUTADA') then
    raise exception 'Estado no permitido'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date<p_start_date then
    raise exception 'Fecha fin anterior al inicio'; end if;
  update public.orders set status=p_status,
    assigned_to=left(coalesce(p_assigned_to,''),120),due_date=p_due_date,
    notes=left(coalesce(p_notes,''),5000),start_date=p_start_date,end_date=p_end_date,
    planned_date=p_planned_date,route_group=left(coalesce(p_route_group,''),120),
    updated_at=now(),updated_by=auth.uid()
  where order_no=p_order_no and upper(btrim(class_code)) not in ('DC01','CADE','RC01','EMER');
  if not found then raise exception 'Orden no encontrada o fuera del alcance interno'; end if;
end;
$$;

create or replace function public.audit_order_management()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if (old.status,old.assigned_to,old.notes,old.due_date,old.start_date,old.end_date,old.planned_date,old.route_group)
      is distinct from
     (new.status,new.assigned_to,new.notes,new.due_date,new.start_date,new.end_date,new.planned_date,new.route_group) then
    insert into public.work_logs(order_no,actor_id,old_status,new_status,
      old_assigned_to,new_assigned_to,notes,old_start_date,new_start_date,
      old_end_date,new_end_date,old_planned_date,new_planned_date,old_route_group,new_route_group)
    values(new.order_no,auth.uid(),old.status,new.status,old.assigned_to,new.assigned_to,
      new.notes,old.start_date,new.start_date,old.end_date,new.end_date,
      old.planned_date,new.planned_date,old.route_group,new.route_group);
  end if;
  return new;
end;
$$;

revoke all on function public.ingest_order_batch(uuid,date,jsonb) from public;
revoke all on function public.update_order_management_v2(text,text,text,date,text,date,date,date,text) from public;
grant execute on function public.ingest_order_batch(uuid,date,jsonb) to authenticated;
grant execute on function public.update_order_management_v2(text,text,text,date,text,date,date,date,text) to authenticated;
-- Las filas antiguas de clases excluidas NO se eliminan: se ocultan en la interfaz
-- y no pueden recibir gestión mediante la función v2.

-- Ocultar también clases externas en lecturas directas autenticadas de la tabla.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
  using (public.is_conocoto_member()
   and upper(btrim(class_code)) not in ('DC01','CADE','RC01','EMER'));

-- La función antigua de gestión queda inhabilitada para evitar modificar clases excluidas.
revoke execute on function public.update_order_management(text,text,text,date,text) from authenticated;
