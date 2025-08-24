-- supabase/init.sql
-- =========================================
-- Supplier Pricing Pipeline (DB installer)
-- =========================================

create extension if not exists pgcrypto;

-- Core catalog tables (no-ops if exist)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null check (family in ('bag','cup','carton','other')),
  print_method text,
  material_group text,
  created_at timestamptz default now()
);

create table if not exists product_configs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  attrs jsonb not null,
  dims  jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text default 'USD',
  incoterm text default 'FOB'
);

create table if not exists supplier_rate_cards (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  family text not null,
  base jsonb not null,
  freight jsonb not null default '{"mode":"ocean","per_kg":0.45,"min":350}',
  duty numeric not null default 0,
  fx_to_usd numeric not null default 1.0,
  active boolean default true,
  unique (supplier_id, family, active)
);

do $$ begin create type rule_action as enum ('adder','multiplier','override'); exception when duplicate_object then null; end $$;
do $$ begin create type rule_basis  as enum ('per_unit','per_m2','per_kg','per_order','per_shipment'); exception when duplicate_object then null; end $$;

create table if not exists pricing_rules (
  id bigserial primary key,
  supplier_id uuid null,
  family text null,
  condition jsonb not null,
  action rule_action not null,
  basis rule_basis not null,
  value numeric not null,
  notes text,
  priority int default 100,
  effective_from date default now(),
  effective_to date default '2999-12-31'
);

create table if not exists margin_tiers (
  id bigserial primary key,
  family text not null,
  min_qty int not null,
  max_qty int not null,
  target_margin numeric not null
);

-- Geometry & weight helpers
create or replace function fn_layout_area_m2(family text, dims jsonb)
returns numeric language plpgsql as $$
declare w numeric; h numeric; g numeric; d numeric; l numeric;
begin
  w := coalesce((dims->>'width_mm')::numeric,0);
  h := coalesce((dims->>'height_mm')::numeric,0);
  g := coalesce((dims->>'gusset_mm')::numeric,0);
  d := coalesce((dims->>'diameter_mm')::numeric,0);
  l := coalesce((dims->>'length_mm')::numeric,0);
  if (dims ? 'area_m2') then return (dims->>'area_m2')::numeric; end if;
  case family
    when 'bag' then    return ((w*h*2)+(g*h*2))/1e6;
    when 'cup' then    return (3.1415926535 * d * h)/1e6;
    when 'carton' then return (2*((w*l)+(l*h)+(w*h)))/1e6;
    else               return null;
  end case;
end $$;

create or replace function fn_weight_kg(dims jsonb, area_m2 numeric)
returns numeric language plpgsql as $$
declare gsm numeric := null; thickness_um numeric := null; density_g_cm3 numeric := null;
begin
  if area_m2 is null then return null; end if;
  if dims ? 'weight_kg' then return (dims->>'weight_kg')::numeric; end if;
  if dims ? 'gsm' then gsm := (dims->>'gsm')::numeric; return area_m2 * gsm / 1000.0; end if;
  if (dims ? 'thickness_um') and (dims ? 'density_g_cm3') then
    thickness_um := (dims->>'thickness_um')::numeric;
    density_g_cm3 := (dims->>'density_g_cm3')::numeric;
    return area_m2 * (thickness_um/1e6) * (density_g_cm3*1000.0);
  end if;
  return null;
end $$;

-- Rule evaluator
create or replace function fn_rule_matches(cond jsonb, attrs jsonb, calc jsonb)
returns boolean language plpgsql as $$
declare k text; v jsonb; item jsonb;
function get_val(path text) returns text as $f$
begin
  if position('.' in path) > 0 then
    if left(path,6)='attrs.' then return attrs->>substr(path,7);
    elsif left(path,5)='calc.' then return calc ->>substr(path,6);
    end if;
  end if; return null;
end; $f$ language plpgsql;
begin
  if cond ? 'all' then
    foreach item in array (select jsonb_array_elements(cond->'all')) loop
      if not fn_rule_matches(item, attrs, calc) then return false; end if;
    end loop; return true;
  elsif cond ? 'any' then
    foreach item in array (select jsonb_array_elements(cond->'any')) loop
      if fn_rule_matches(item, attrs, calc) then return true; end if;
    end loop; return false;
  else
    k := (select key from jsonb_each(cond) limit 1);
    v := cond->k;
    if v ? 'eq'   then return coalesce(get_val(k),'') = (v->>'eq');
    if v ? 'in'   then return (get_val(k)) = any (select jsonb_array_elements_text(v->'in'));
    if v ? 'regex'then return coalesce(get_val(k),'') ~ (v->>'regex');
    if v ? 'gt'   then return coalesce((get_val(k))::numeric,0) >  (v->>'gt')::numeric;
    if v ? 'gte'  then return coalesce((get_val(k))::numeric,0) >= (v->>'gte')::numeric;
    if v ? 'lt'   then return coalesce((get_val(k))::numeric,0) <  (v->>'lt')::numeric;
    if v ? 'lte'  then return coalesce((get_val(k))::numeric,0) <= (v->>'lte')::numeric;
    return false;
  end if;
end $$;

create or replace function fn_pretty_round(x numeric)
returns numeric language plpgsql as $$
declare c numeric;
begin c := round(x::numeric, 2);
  if c >= 1 then return floor(c) + 0.95; else return round(c,2); end if;
end $$;

-- Price computation (active rate card)
create type computed_price as (
  qty int, supplier_id uuid, landed_unit_cost numeric,
  target_margin numeric, sell_unit_price numeric, breakdown jsonb
);

create or replace function compute_price(p_config_id uuid, p_supplier_id uuid, p_qty int)
returns computed_price language plpgsql as $$
declare prod products; cfg product_configs; rc record;
  area_m2 numeric; weight_kg numeric; base jsonb;
  included_colors int; colors int := 0; coverage text := null;
  setup_fee numeric := 0; plate_fee numeric := 0; waste_factor numeric := 0;
  material_per_m2 numeric := 0; print_per_m2 numeric := 0; color_over int := 0;
  material_cost numeric := 0; print_cost numeric := 0; finishing_adders numeric := 0;
  mfg_cost numeric := 0; setup_plate_unit numeric := 0; freight_per_unit numeric := 0;
  duty_per_unit numeric := 0; landed_unit numeric := 0;
  coverage_mult numeric := 1.0; color_mult numeric := 1.0;
  calc jsonb; margin numeric := 0.30; sell numeric; br jsonb := '{}'::jsonb;
begin
  select * into prod from products where id=(select product_id from product_configs where id=p_config_id);
  if not found then raise exception 'product not found for config %', p_config_id; end if;
  select * into cfg from product_configs where id = p_config_id;

  area_m2  := fn_layout_area_m2(prod.family, cfg.dims);
  weight_kg:= fn_weight_kg(cfg.dims, area_m2);

  select base, freight, duty, fx_to_usd into rc
  from supplier_rate_cards
  where supplier_id=p_supplier_id and family=prod.family and active=true limit 1;
  if not found then raise exception 'no active rate card for supplier % and family %', p_supplier_id, prod.family; end if;

  base := rc.base;
  material_per_m2 := coalesce((base->>'material_per_m2')::numeric,0);
  print_per_m2    := coalesce((base->>'print_per_m2')::numeric,0);
  included_colors := coalesce((base->>'included_colors')::int,0);
  setup_fee       := coalesce((base->>'setup_fee')::numeric,0);
  plate_fee       := coalesce((base->>'plate_fee')::numeric,0);
  waste_factor    := coalesce((base->>'waste_factor')::numeric,0);

  colors   := coalesce((cfg.attrs->>'colors')::int,0);
  coverage := cfg.attrs->>'coverage';
  color_over := greatest(colors - included_colors, 0);

  if coverage in ('26-50%','51-75%','76-100%') then
    coverage_mult := case coverage when '26-50%' then 1.20 when '51-75%' then 1.40 when '76-100%' then 1.70 else 1.0 end;
  end if;
  color_mult := 1.0 + (0.15 * color_over);

  material_cost := coalesce(area_m2,0) * material_per_m2;
  print_cost    := coalesce(area_m2,0) * print_per_m2 * coverage_mult * color_mult;

  calc := jsonb_build_object(
    'area_m2', area_m2, 'weight_kg', weight_kg, 'colors_over_included', color_over,
    'base_material_cost', material_cost, 'base_print_cost', print_cost
  );

  for rc in
    select * from pricing_rules
     where (supplier_id is null or supplier_id=p_supplier_id)
       and (family is null or family=prod.family)
       and now()::date between effective_from and effective_to
     order by priority asc, id asc
  loop
    if fn_rule_matches(rc.condition, cfg.attrs, calc) then
      if rc.action = 'adder' then
        case rc.basis
          when 'per_m2' then finishing_adders := finishing_adders + coalesce(area_m2,0)*rc.value;
          when 'per_unit' then finishing_adders := finishing_adders + rc.value;
          when 'per_kg' then finishing_adders := finishing_adders + coalesce(weight_kg,0)*rc.value;
          when 'per_order','per_shipment' then setup_plate_unit := setup_plate_unit + (rc.value/nullif(p_qty,0));
        end case;
      elsif rc.action = 'multiplier' then
        case rc.basis
          when 'per_m2','per_unit','per_kg' then
            material_cost := material_cost * rc.value;
            print_cost    := print_cost    * rc.value;
            finishing_adders := finishing_adders * rc.value;
          when 'per_order','per_shipment' then setup_plate_unit := setup_plate_unit * rc.value;
        end case;
      elsif rc.action = 'override' then
        if rc.basis in ('per_order','per_shipment') then
          setup_plate_unit := greatest(setup_plate_unit, rc.value/nullif(p_qty,0));
        end if;
      end if;
    end if;
  end loop;

  setup_plate_unit := setup_plate_unit + (setup_fee + (plate_fee * colors)) / nullif(p_qty,0);
  mfg_cost := (material_cost + print_cost + finishing_adders) * (1 + waste_factor);

  if (rc.freight ? 'per_kg') then
    freight_per_unit := greatest(((rc.freight->>'per_kg')::numeric * coalesce(weight_kg,0)) / nullif(p_qty,0),
                                  (rc.freight->>'min')::numeric / nullif(p_qty,0));
  elsif (rc.freight ? 'per_unit') then
    freight_per_unit := (rc.freight->>'per_unit')::numeric;
  else freight_per_unit := 0; end if;

  duty_per_unit := coalesce(rc.duty,0) * mfg_cost;

  landed_unit := (mfg_cost + setup_plate_unit + freight_per_unit + duty_per_unit) * coalesce(rc.fx_to_usd,1);

  select target_margin into margin
    from margin_tiers where family=prod.family and p_qty between min_qty and max_qty
    order by min_qty desc limit 1;

  -- fallback to 30% if no tier exists
  margin := coalesce(margin, 0.30);
  return (
    p_qty,
    p_supplier_id,
    landed_unit,
    margin,
    fn_pretty_round(landed_unit / (1 - margin)),
    jsonb_build_object(
      'area_m2', area_m2, 'weight_kg', weight_kg,
      'material_cost', material_cost, 'print_cost', print_cost,
      'finishing_adders', finishing_adders, 'setup_plate_unit', setup_plate_unit,
      'freight_per_unit', freight_per_unit, 'duty_per_unit', duty_per_unit, 'waste_factor', waste_factor
    )
  )::computed_price;
end $$;

create or replace function compute_price_tiers(p_config_id uuid, p_supplier_id uuid, p_qty_list int[])
returns setof computed_price language sql as $$
  select (compute_price(p_config_id, p_supplier_id, q)).* from unnest(p_qty_list) as q;
$$;

-- Inbox / staging pipeline
create table if not exists supplier_uploads (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  file_path text not null,
  file_name text not null,
  mime_type text,
  uploaded_by uuid,
  status text not null default 'uploaded', -- uploaded|parsed|mapped|normalized|matrix_ready|approved|error
  detected_format text,
  pages int,
  notes text,
  created_at timestamptz default now()
);

create table if not exists supplier_quote_raw_rows (
  upload_id uuid references supplier_uploads(id) on delete cascade,
  row_index int,
  page int,
  raw jsonb,
  primary key (upload_id, row_index)
);

create table if not exists supplier_mapping_profiles (
  id bigserial primary key,
  supplier_id uuid not null references suppliers(id),
  profile_name text not null default 'default',
  header_map jsonb not null,
  constant_map jsonb,
  created_at timestamptz default now(),
  unique (supplier_id, profile_name)
);

create table if not exists supplier_rate_card_staging (
  upload_id uuid primary key references supplier_uploads(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  family text not null,
  base jsonb not null,
  freight jsonb not null,
  duty numeric not null default 0,
  fx_to_usd numeric not null default 1,
  derived_from jsonb
);

create table if not exists supplier_rate_card_staging_rules (
  upload_id uuid references supplier_uploads(id) on delete cascade,
  rule jsonb,
  idx int generated by default as identity,
  primary key (upload_id, idx)
);

-- RPCs
create or replace function inbox_register_upload(p_supplier_id uuid, p_file_path text, p_file_name text, p_mime text)
returns uuid language sql as $$
  insert into supplier_uploads (supplier_id, file_path, file_name, mime_type, uploaded_by)
  values (p_supplier_id, p_file_path, p_file_name, p_mime, auth.uid())
  returning id;
$$;

-- Normalize raw rows into staging (using a saved mapping profile)
create or replace function normalize_upload_to_staging(p_upload_id uuid, p_family text, p_profile_id bigint)
returns void language plpgsql as $$
declare m jsonb; c jsonb; u supplier_uploads; first_row jsonb;
        material_per_m2 numeric := null; print_per_m2 numeric := null;
        included_colors int := 1; setup_fee numeric := 0; plate_fee numeric := 0; waste_factor numeric := 0.05;
        freight jsonb := '{"mode":"ocean","per_kg":0.45,"min":350}'; duty numeric := 0;
begin
  select * into u from supplier_uploads where id=p_upload_id;
  select header_map, coalesce(constant_map,'{}'::jsonb) into m, c from supplier_mapping_profiles where id=p_profile_id;
  select raw->'cols' into first_row from supplier_quote_raw_rows where upload_id=p_upload_id order by row_index asc limit 1;

  if first_row is not null and m is not null then
    material_per_m2 := nullif((first_row->>(m->>'material_per_m2')),'')::numeric;
    print_per_m2    := nullif((first_row->>(m->>'print_per_m2')),'')::numeric;
    included_colors := coalesce(nullif((first_row->>(m->>'included_colors')),'')::int, included_colors);
    setup_fee       := coalesce(nullif((first_row->>(m->>'setup_fee')),'')::numeric, setup_fee);
    plate_fee       := coalesce(nullif((first_row->>(m->>'plate_fee')),'')::numeric, plate_fee);
    waste_factor    := coalesce(nullif((first_row->>(m->>'waste_factor')),'')::numeric, waste_factor);
  end if;

  insert into supplier_rate_card_staging(upload_id, supplier_id, family, base, freight, duty, fx_to_usd, derived_from)
  values (p_upload_id, u.supplier_id, p_family,
          jsonb_build_object('material_per_m2',material_per_m2,'print_per_m2',print_per_m2,'included_colors',included_colors,'setup_fee',setup_fee,'plate_fee',plate_fee,'waste_factor',waste_factor),
          freight, duty, 1.0,
          jsonb_build_object('source','supplier_quote_raw_rows','profile_id',p_profile_id))
  on conflict (upload_id) do update set family=excluded.family, base=excluded.base, freight=excluded.freight, duty=excluded.duty, derived_from=excluded.derived_from;

  update supplier_uploads set status='normalized' where id=p_upload_id;
end $$;

-- Publish staging -> active rate card
create or replace function publish_staging_rate_card(p_upload_id uuid)
returns uuid language plpgsql as $$
declare s supplier_rate_card_staging; new_id uuid;
begin
  select * into s from supplier_rate_card_staging where upload_id=p_upload_id;
  if not found then raise exception 'no staging found for %', p_upload_id; end if;

  update supplier_rate_cards set active=false where supplier_id=s.supplier_id and family=s.family and active=true;

  insert into supplier_rate_cards(supplier_id,family,base,freight,duty,fx_to_usd,active)
  values (s.supplier_id, s.family, s.base, s.freight, s.duty, s.fx_to_usd, true)
  returning id into new_id;

  update supplier_uploads set status='approved' where id=p_upload_id;
  return new_id;
end $$;

-- Preview matrix directly from STAGING JSON (no active card needed)
create or replace function generate_matrix_from_staging(
  p_upload_id uuid,
  p_config_id uuid,
  p_qty_list int[]
) returns table(qty int, landed numeric, margin numeric, price numeric, breakdown jsonb)
language plpgsql as $$
declare s supplier_rate_card_staging; prod products; cfg product_configs;
        area_m2 numeric; weight_kg numeric; q int;
        base jsonb; freight jsonb; duty numeric; fx numeric;
        included_colors int; setup_fee numeric; plate_fee numeric; waste_factor numeric;
        material_per_m2 numeric; print_per_m2 numeric;
        colors int; coverage text; color_over int;
        material_cost numeric; print_cost numeric; finishing_adders numeric;
        mfg_cost numeric; setup_plate_unit numeric; freight_per_unit numeric; duty_per_unit numeric;
        coverage_mult numeric; color_mult numeric; calc jsonb; margin numeric; br jsonb;
begin
  select * into s from supplier_rate_card_staging where upload_id=p_upload_id;
  if not found then raise exception 'staging not found'; end if;

  select * into prod from products where id=(select product_id from product_configs where id=p_config_id);
  select * into cfg from product_configs where id=p_config_id;

  base := s.base; freight := s.freight; duty := s.duty; fx := s.fx_to_usd;

  included_colors := coalesce((base->>'included_colors')::int, 0);
  setup_fee       := coalesce((base->>'setup_fee')::numeric, 0);
  plate_fee       := coalesce((base->>'plate_fee')::numeric, 0);
  waste_factor    := coalesce((base->>'waste_factor')::numeric, 0);
  material_per_m2 := coalesce((base->>'material_per_m2')::numeric, 0);
  print_per_m2    := coalesce((base->>'print_per_m2')::numeric, 0);

  area_m2  := fn_layout_area_m2(prod.family, cfg.dims);
  weight_kg:= fn_weight_kg(cfg.dims, area_m2);

  colors   := coalesce((cfg.attrs->>'colors')::int,0);
  coverage := cfg.attrs->>'coverage';
  color_over := greatest(colors - included_colors, 0);

  coverage_mult := case coverage when '26-50%' then 1.20 when '51-75%' then 1.40 when '76-100%' then 1.70 else 1.0 end;
  color_mult := 1.0 + (0.15 * color_over);

  material_cost := coalesce(area_m2,0) * material_per_m2;
  print_cost    := coalesce(area_m2,0) * print_per_m2 * coverage_mult * color_mult;

  calc := jsonb_build_object('area_m2',area_m2,'weight_kg',weight_kg,'colors_over_included',color_over,'base_material_cost',material_cost,'base_print_cost',print_cost);
  finishing_adders := 0; setup_plate_unit := 0;

  -- Apply pricing_rules (supplier-specific or general)
  for q in select unnest(p_qty_list)
  loop
    -- recompute rule effects per qty because some rules are per_order
    finishing_adders := 0; setup_plate_unit := 0;

    for base in
      select to_jsonb(pricing_rules.*) from pricing_rules
       where (supplier_id is null or supplier_id = s.supplier_id)
         and (family is null or family = prod.family)
         and now()::date between effective_from and effective_to
       order by priority asc, id asc
    loop
      -- unpack rule fields
      if fn_rule_matches((base->>'condition')::jsonb, cfg.attrs, calc) then
        if (base->>'action') = 'adder' then
          case (base->>'basis')
            when 'per_m2' then finishing_adders := finishing_adders + coalesce(area_m2,0) * (base->>'value')::numeric;
            when 'per_unit' then finishing_adders := finishing_adders + (base->>'value')::numeric;
            when 'per_kg' then finishing_adders := finishing_adders + coalesce(weight_kg,0) * (base->>'value')::numeric;
            when 'per_order','per_shipment' then setup_plate_unit := setup_plate_unit + ((base->>'value')::numeric / nullif(q,0));
          end case;
        elsif (base->>'action') = 'multiplier' then
          case (base->>'basis')
            when 'per_m2','per_unit','per_kg' then
              material_cost := material_cost * (base->>'value')::numeric;
              print_cost    := print_cost    * (base->>'value')::numeric;
              finishing_adders := finishing_adders * (base->>'value')::numeric;
            when 'per_order','per_shipment' then setup_plate_unit := setup_plate_unit * (base->>'value')::numeric;
          end case;
        elsif (base->>'action') = 'override' then
          if (base->>'basis') in ('per_order','per_shipment') then
            setup_plate_unit := greatest(setup_plate_unit, (base->>'value')::numeric / nullif(q,0));
          end if;
        end if;
      end if;
    end loop;

    -- setup/plates per qty
    setup_plate_unit := setup_plate_unit + (setup_fee + (plate_fee * colors)) / nullif(q,0);
    mfg_cost := (material_cost + print_cost + finishing_adders) * (1 + waste_factor);

    if (freight ? 'per_kg') then
      freight_per_unit := greatest(((freight->>'per_kg')::numeric * coalesce(weight_kg,0)) / nullif(q,0),
                                    (freight->>'min')::numeric / nullif(q,0));
    elsif (freight ? 'per_unit') then
      freight_per_unit := (freight->>'per_unit')::numeric;
    else freight_per_unit := 0; end if;

    duty_per_unit := coalesce(duty,0) * mfg_cost;
    -- landed per unit in USD
    mfg_cost := (mfg_cost + setup_plate_unit + freight_per_unit + duty_per_unit) * coalesce(fx,1);

    select target_margin into margin
      from margin_tiers where family=prod.family and q between min_qty and max_qty
      order by min_qty desc limit 1;
    margin := coalesce(margin, 0.30);

    br := jsonb_build_object(
      'area_m2', area_m2, 'weight_kg', weight_kg,
      'material_cost', material_cost, 'print_cost', print_cost,
      'finishing_adders', finishing_adders, 'setup_plate_unit', setup_plate_unit,
      'freight_per_unit', freight_per_unit, 'duty_per_unit', duty_per_unit, 'waste_factor', waste_factor
    );

    qty := q;
    landed := mfg_cost;
    price := fn_pretty_round(mfg_cost / (1 - margin));
    return next;
  end loop;

  update supplier_uploads set status='matrix_ready' where id=p_upload_id;
end $$;

-- RLS (permissive starter policies — tighten for production)
alter table supplier_uploads enable row level security;
alter table supplier_quote_raw_rows enable row level security;
alter table supplier_mapping_profiles enable row level security;
alter table supplier_rate_card_staging enable row level security;
alter table supplier_rate_card_staging_rules enable row level security;

create policy if not exists "auth read uploads" on supplier_uploads for select to authenticated using (true);
create policy if not exists "auth write uploads" on supplier_uploads for insert with check (true);
create policy if not exists "auth update uploads" on supplier_uploads for update using (true);

create policy if not exists "auth read raw" on supplier_quote_raw_rows for select to authenticated using (true);
create policy if not exists "auth write raw" on supplier_quote_raw_rows for insert with check (true);

create policy if not exists "auth read mapping" on supplier_mapping_profiles for select to authenticated using (true);
create policy if not exists "auth write mapping" on supplier_mapping_profiles for insert with check (true);

create policy if not exists "auth read staging" on supplier_rate_card_staging for select to authenticated using (true);
create policy if not exists "auth write staging" on supplier_rate_card_staging for insert with check (true) using (true);

create policy if not exists "auth read staging rules" on supplier_rate_card_staging_rules for select to authenticated using (true);
create policy if not exists "auth write staging rules" on supplier_rate_card_staging_rules for insert with check (true);

-- Optional starter data
insert into margin_tiers(family,min_qty,max_qty,target_margin)
select x.* from (values
  ('bag',1,9999,0.38),('bag',10000,19999,0.34),('bag',20000,9999999,0.30),
  ('cup',1,9999,0.32),('cup',10000,19999,0.30),('cup',20000,9999999,0.28)
) as x(family,min_qty,max_qty,target_margin)
on conflict do nothing;

-- Storage Policies (run once; you can also paste these in Studio directly)
create policy if not exists "auth can list supplier-quotes"
on storage.objects for select to authenticated using (bucket_id = 'supplier-quotes');

create policy if not exists "auth can upload supplier-quotes"
on storage.objects for insert to authenticated with check (bucket_id = 'supplier-quotes');

create policy if not exists "auth can update supplier-quotes"
on storage.objects for update to authenticated using (bucket_id = 'supplier-quotes');

create policy if not exists "auth can delete supplier-quotes"
on storage.objects for delete to authenticated using (bucket_id = 'supplier-quotes');
