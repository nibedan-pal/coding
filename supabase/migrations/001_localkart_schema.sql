-- =====================================================================
-- LocalKart — hyperlocal multi-vendor delivery app
-- Supabase database setup (run once in Supabase → SQL Editor → Run)
--
-- Creates: enums, 11 tables, Row Level Security, signup trigger,
-- order/delivery functions (RPCs), storage buckets for images, realtime,
-- and starter data (settings + categories).
--
-- Key rule: apps never change order status directly. They call the
-- functions in section 7 (place_order, vendor_update_order,
-- agent_update_order ...). Prices, fees and stock are always computed
-- on the server, so a modified app cannot cheat.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('customer', 'vendor', 'agent', 'admin');
create type public.account_status as enum ('active', 'pending', 'suspended', 'rejected');
create type public.shop_status    as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.order_status   as enum ('placed', 'accepted', 'packed', 'picked_up', 'delivered', 'rejected', 'cancelled', 'failed');
create type public.agent_state    as enum ('searching', 'requested', 'assigned', 'at_shop', 'picked', 'done');
create type public.payment_mode   as enum ('cod', 'online');
create type public.payment_status as enum ('pending', 'paid', 'refund_pending', 'refunded', 'failed');
create type public.txn_type       as enum ('vendor_payout', 'rider_payout', 'refund', 'cod_deposit');
create type public.coupon_type    as enum ('flat', 'percent');


-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

-- One row per signed-up person, linked to Supabase Auth
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  email       text,
  role        public.user_role      not null default 'customer',
  status      public.account_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Single-row table with platform-wide settings the admin controls
create table public.platform_settings (
  id                    int primary key default 1 check (id = 1),
  commission_pct        numeric(5,2)  not null default 10,   -- % of item total taken from shop
  platform_fee          numeric(10,2) not null default 4,    -- ₹ per order, paid by customer
  delivery_base_fee     numeric(10,2) not null default 15,   -- ₹
  delivery_per_km       numeric(10,2) not null default 6,    -- ₹ per km
  free_delivery_above   numeric(10,2),                        -- ₹ item total; null = never free
  cod_limit             numeric(10,2) not null default 2000, -- ₹ max COD order
  rider_share_pct       numeric(5,2)  not null default 80,   -- % of delivery fee paid to rider
  agent_accept_seconds  int           not null default 30,
  updated_at            timestamptz not null default now()
);

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text not null default 'Home',          -- Home / Work / Other
  line1       text not null,
  line2       text,
  landmark    text,
  city        text not null,
  pincode     text not null,
  lat         double precision not null,
  lng         double precision not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.categories (
  id         serial primary key,
  name       text not null unique,
  icon_url   text,
  parent_id  int references public.categories (id),
  sort       int not null default 0
);

create table public.shops (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete restrict,
  name                text not null,
  description         text,
  category_id         int references public.categories (id),
  logo_url            text,
  phone               text,
  address             text not null,
  city                text not null,
  pincode             text not null,
  lat                 double precision not null,
  lng                 double precision not null,
  delivery_radius_km  numeric(5,2) not null default 3,
  prep_minutes        int not null default 8,         -- avg packing time, used for ETA
  open_time           time default '08:00',
  close_time          time default '22:00',
  is_open             boolean not null default true,  -- owner's open/closed toggle
  gstin               text,
  fssai_no            text,
  status              public.shop_status not null default 'pending',  -- admin approves
  commission_pct      numeric(5,2),                   -- null = platform default
  rating              numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  category_id  int references public.categories (id),
  name         text not null,
  description  text,
  unit         text not null default '1 pc',     -- 500 ml, 1 kg, 6 pcs
  price        numeric(10,2) not null check (price > 0),
  mrp          numeric(10,2) not null,
  stock        int not null default 0 check (stock >= 0),
  images       text[] not null default '{}',      -- URLs from Supabase Storage
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (mrp >= price)
);

-- Rider details; row is created automatically when a rider signs up
create table public.delivery_agents (
  id              uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type    text default 'bike',            -- bike / scooter / cycle
  vehicle_no      text,
  is_online       boolean not null default false,
  is_busy         boolean not null default false, -- on a delivery right now
  lat             double precision,
  lng             double precision,
  location_at     timestamptz,
  cash_in_hand    numeric(10,2) not null default 0, -- COD cash not yet deposited
  earnings_total  numeric(10,2) not null default 0,
  rating          numeric(3,2) not null default 0,
  updated_at      timestamptz not null default now()
);

create table public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  type          public.coupon_type not null,
  value         numeric(10,2) not null,         -- ₹ off, or % off
  min_order     numeric(10,2) not null default 0,
  max_discount  numeric(10,2),                  -- cap for percent coupons
  shop_id       uuid references public.shops (id) on delete cascade, -- null = all shops
  valid_till    timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            bigint generated always as identity (start with 100001), -- show as LK100001
  customer_id         uuid not null references public.profiles (id),
  shop_id             uuid not null references public.shops (id),
  address_id          uuid not null references public.addresses (id),
  agent_id            uuid references public.delivery_agents (id),
  status              public.order_status not null default 'placed',
  agent_state         public.agent_state,
  declined_agents     uuid[] not null default '{}',
  agent_requested_at  timestamptz,
  items_total         numeric(10,2) not null default 0,
  delivery_fee        numeric(10,2) not null default 0,
  platform_fee        numeric(10,2) not null default 0,
  discount            numeric(10,2) not null default 0,
  total               numeric(10,2) not null default 0,
  commission_amount   numeric(10,2) not null default 0,
  distance_km         numeric(6,2),
  coupon_id           uuid references public.coupons (id),
  payment_mode        public.payment_mode   not null,
  payment_status      public.payment_status not null default 'pending',
  payment_ref         text,                    -- Razorpay payment id
  cancel_reason       text,
  shop_rating         int check (shop_rating between 1 and 5),
  agent_rating        int check (agent_rating between 1 and 5),
  placed_at           timestamptz not null default now(),
  accepted_at         timestamptz,
  packed_at           timestamptz,
  picked_up_at        timestamptz,
  delivered_at        timestamptz,
  updated_at          timestamptz not null default now()
);

-- Item name/price copied at order time so old orders stay correct
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  name        text not null,
  unit        text,
  qty         int  not null check (qty > 0),
  price       numeric(10,2) not null
);

-- Delivery OTP kept apart from orders so the rider can never read it
create table public.order_secrets (
  order_id      uuid primary key references public.orders (id) on delete cascade,
  delivery_otp  text not null
);

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  type        public.txn_type not null,
  user_id     uuid not null references public.profiles (id),
  order_id    uuid references public.orders (id),
  amount      numeric(10,2) not null,
  status      text not null default 'completed',  -- pending / completed / failed
  note        text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------
create index on public.addresses (user_id);
create index on public.shops (status, lat, lng);
create index on public.shops (owner_id);
create index on public.products (shop_id, is_active);
create index on public.products using gin (to_tsvector('simple', name));
create index on public.delivery_agents (is_online, is_busy);
create index on public.orders (customer_id, placed_at desc);
create index on public.orders (shop_id, status);
create index on public.orders (agent_id, status);
create index on public.orders (status, agent_state);
create index on public.order_items (order_id);
create index on public.transactions (user_id, created_at desc);


-- ---------------------------------------------------------------------
-- 4. HELPER FUNCTIONS
-- ---------------------------------------------------------------------

-- Is the logged-in user an admin? (security definer avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- Straight-line distance between two points in km (haversine)
create or replace function public.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns numeric
language sql immutable set search_path = ''
as $$
  select round((6371 * 2 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) *
           power(sin(radians(lng2 - lng1) / 2), 2))))::numeric, 2);
$$;

-- True when the change comes straight from an app (not from our own
-- security-definer functions, which run as the table owner)
create or replace function public.is_direct_app_call()
returns boolean
language sql stable set search_path = ''
as $$
  select current_user in ('authenticated', 'anon') and not public.is_admin();
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. TRIGGERS
-- ---------------------------------------------------------------------

-- 5a. Create a profile when someone signs up.
-- The app passes the role at signup: options: { data: { role: 'vendor', full_name: '...' } }
-- Vendors and riders start as 'pending' until the admin approves them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := case new.raw_user_meta_data ->> 'role'
              when 'vendor' then 'vendor'::public.user_role
              when 'agent'  then 'agent'::public.user_role
              else 'customer'::public.user_role
            end;  -- 'admin' can never be chosen at signup

  insert into public.profiles (id, full_name, phone, email, role, status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    new.email,
    v_role,
    case when v_role = 'customer' then 'active'::public.account_status
         else 'pending'::public.account_status end
  );

  if v_role = 'agent' then
    insert into public.delivery_agents (id, vehicle_type)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'vehicle_type', 'bike'));
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5b. Users can edit their name/phone but never their own role or status
create or replace function public.protect_profile_fields()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_direct_app_call() then
    new.role   := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 5c. Shop owners cannot approve themselves or change commission/rating
create or replace function public.protect_shop_fields()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_direct_app_call() then
    if tg_op = 'INSERT' then
      new.status         := 'pending';
      new.commission_pct := null;
      new.rating         := 0;
      new.rating_count   := 0;
    else
      new.owner_id       := old.owner_id;
      new.status         := old.status;
      new.commission_pct := old.commission_pct;
      new.rating         := old.rating;
      new.rating_count   := old.rating_count;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_shop before insert or update on public.shops
  for each row execute function public.protect_shop_fields();

-- 5d. Riders can update location/online/vehicle, but not money or busy flag
create or replace function public.protect_agent_fields()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_direct_app_call() then
    new.is_busy        := old.is_busy;
    new.cash_in_hand   := old.cash_in_hand;
    new.earnings_total := old.earnings_total;
    new.rating         := old.rating;
    if new.is_online and old.is_busy is false
       and not exists (select 1 from public.profiles p
                       where p.id = new.id and p.status = 'active') then
      new.is_online := false;  -- unapproved riders cannot go online
    end if;
    if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
      new.location_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_agent before update on public.delivery_agents
  for each row execute function public.protect_agent_fields();

-- 5e. updated_at bookkeeping
create trigger touch_profiles  before update on public.profiles          for each row execute function public.set_updated_at();
create trigger touch_shops     before update on public.shops             for each row execute function public.set_updated_at();
create trigger touch_products  before update on public.products          for each row execute function public.set_updated_at();
create trigger touch_agents    before update on public.delivery_agents   for each row execute function public.set_updated_at();
create trigger touch_orders    before update on public.orders            for each row execute function public.set_updated_at();
create trigger touch_settings  before update on public.platform_settings for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (who can see / change what)
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.platform_settings enable row level security;
alter table public.addresses         enable row level security;
alter table public.categories        enable row level security;
alter table public.shops             enable row level security;
alter table public.products          enable row level security;
alter table public.delivery_agents   enable row level security;
alter table public.coupons           enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_secrets     enable row level security;
alter table public.transactions      enable row level security;

-- profiles
create policy "profiles: read own"            on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own"          on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles: rider sees customer" on public.profiles for select using (
  exists (select 1 from public.orders o
          where o.customer_id = profiles.id and o.agent_id = auth.uid()
            and o.agent_state in ('assigned', 'at_shop', 'picked')));
create policy "profiles: customer sees rider" on public.profiles for select using (
  exists (select 1 from public.orders o
          where o.agent_id = profiles.id and o.customer_id = auth.uid()
            and o.agent_state in ('assigned', 'at_shop', 'picked')));

-- platform_settings
create policy "settings: everyone reads" on public.platform_settings for select using (true);
create policy "settings: admin updates"  on public.platform_settings for update using (public.is_admin()) with check (public.is_admin());

-- addresses
create policy "addresses: own"        on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "addresses: admin read" on public.addresses for select using (public.is_admin());
create policy "addresses: rider read" on public.addresses for select using (
  exists (select 1 from public.orders o
          where o.address_id = addresses.id and o.agent_id = auth.uid()
            and o.agent_state in ('assigned', 'at_shop', 'picked')));

-- categories
create policy "categories: everyone reads" on public.categories for select using (true);
create policy "categories: admin writes"   on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- shops
create policy "shops: read approved or own" on public.shops for select using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "shops: vendor creates"       on public.shops for insert with check (
  owner_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'vendor'));
create policy "shops: owner or admin updates" on public.shops for update using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy "shops: admin deletes"        on public.shops for delete using (public.is_admin());

-- products
create policy "products: public reads listed" on public.products for select using (
  is_active and exists (select 1 from public.shops s where s.id = products.shop_id and s.status = 'approved'));
create policy "products: owner manages" on public.products for all
  using (exists (select 1 from public.shops s where s.id = products.shop_id and s.owner_id = auth.uid()) or public.is_admin())
  with check (exists (select 1 from public.shops s where s.id = products.shop_id and s.owner_id = auth.uid()) or public.is_admin());

-- delivery_agents
create policy "agents: read own"      on public.delivery_agents for select using (id = auth.uid() or public.is_admin());
create policy "agents: update own"    on public.delivery_agents for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "agents: customer tracks rider" on public.delivery_agents for select using (
  exists (select 1 from public.orders o
          where o.agent_id = delivery_agents.id and o.customer_id = auth.uid()
            and o.agent_state in ('assigned', 'at_shop', 'picked')));

-- coupons
create policy "coupons: logged-in users read active" on public.coupons for select to authenticated using (is_active);
create policy "coupons: admin manages"               on public.coupons for all using (public.is_admin()) with check (public.is_admin());

-- orders (read only from the apps; changes go through functions in section 7)
create policy "orders: involved parties read" on public.orders for select using (
  customer_id = auth.uid()
  or agent_id = auth.uid()
  or exists (select 1 from public.shops s where s.id = orders.shop_id and s.owner_id = auth.uid())
  or public.is_admin());
create policy "orders: admin updates" on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- order_items: visible whenever the parent order is visible
create policy "order_items: follow order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_items.order_id));

-- order_secrets: only the customer (and admin) can see the delivery OTP
create policy "otp: customer only" on public.order_secrets for select using (
  public.is_admin()
  or exists (select 1 from public.orders o where o.id = order_secrets.order_id and o.customer_id = auth.uid()));

-- transactions
create policy "transactions: read own"      on public.transactions for select using (user_id = auth.uid() or public.is_admin());
create policy "transactions: admin manages" on public.transactions for all using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 7. APP FUNCTIONS (call from apps with supabase.rpc('name', {...}))
-- ---------------------------------------------------------------------

-- 7a. Shops near a location, closest first
create or replace function public.nearby_shops(p_lat double precision, p_lng double precision)
returns table (
  shop_id      uuid,
  name         text,
  category_id  int,
  logo_url     text,
  rating       numeric,
  is_open      boolean,
  distance_km  numeric,
  eta_minutes  int
)
language sql stable set search_path = ''
as $$
  select s.id, s.name, s.category_id, s.logo_url, s.rating, s.is_open,
         public.distance_km(p_lat, p_lng, s.lat, s.lng) as d,
         (s.prep_minutes + ceil(public.distance_km(p_lat, p_lng, s.lat, s.lng) * 4))::int
  from public.shops s
  where s.status = 'approved'
    and s.lat between p_lat - 0.15 and p_lat + 0.15      -- quick box filter (~16 km)
    and s.lng between p_lng - 0.15 and p_lng + 0.15
    and public.distance_km(p_lat, p_lng, s.lat, s.lng) <= s.delivery_radius_km
  order by s.is_open desc, d asc;
$$;

-- 7b. Place an order. Totals, fees, stock and OTP are all computed here.
-- p_items example: '[{"product_id":"<uuid>","qty":2},{"product_id":"<uuid>","qty":1}]'
create or replace function public.place_order(
  p_shop_id      uuid,
  p_address_id   uuid,
  p_items        jsonb,
  p_payment_mode public.payment_mode,
  p_coupon_code  text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_set          public.platform_settings%rowtype;
  v_shop         public.shops%rowtype;
  v_addr         public.addresses%rowtype;
  v_prod         public.products%rowtype;
  v_coupon       public.coupons%rowtype;
  v_item         jsonb;
  v_qty          int;
  v_dist         numeric;
  v_items_total  numeric(10,2) := 0;
  v_fee          numeric(10,2);
  v_discount     numeric(10,2) := 0;
  v_total        numeric(10,2);
  v_order_id     uuid;
begin
  if v_uid is null then
    raise exception 'Please log in to place an order';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;

  select * into v_set from public.platform_settings where id = 1;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found or v_shop.status <> 'approved' or not v_shop.is_open then
    raise exception 'This shop is not taking orders right now';
  end if;

  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if not found then
    raise exception 'Delivery address not found';
  end if;

  v_dist := public.distance_km(v_shop.lat, v_shop.lng, v_addr.lat, v_addr.lng);
  if v_dist > v_shop.delivery_radius_km then
    raise exception 'This shop does not deliver to your address (% km away)', v_dist;
  end if;

  insert into public.orders (customer_id, shop_id, address_id, payment_mode, distance_km)
  values (v_uid, p_shop_id, p_address_id, p_payment_mode, v_dist)
  returning id into v_order_id;

  -- Items: lock each product row, check stock, reduce it, copy name and price
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then
      raise exception 'Invalid quantity in cart';
    end if;

    select * into v_prod from public.products
    where id = (v_item ->> 'product_id')::uuid and shop_id = p_shop_id and is_active
    for update;
    if not found then
      raise exception 'An item in your cart is no longer available';
    end if;
    if v_prod.stock < v_qty then
      raise exception 'Only % left of %', v_prod.stock, v_prod.name;
    end if;

    update public.products set stock = stock - v_qty where id = v_prod.id;
    insert into public.order_items (order_id, product_id, name, unit, qty, price)
    values (v_order_id, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_prod.price);
    v_items_total := v_items_total + v_prod.price * v_qty;
  end loop;

  -- Coupon
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from public.coupons
    where upper(code) = upper(trim(p_coupon_code))
      and is_active
      and (valid_till is null or valid_till > now())
      and (shop_id is null or shop_id = p_shop_id);
    if not found then
      raise exception 'Coupon % is not valid', p_coupon_code;
    end if;
    if v_items_total < v_coupon.min_order then
      raise exception 'Add items worth ₹% more to use this coupon', v_coupon.min_order - v_items_total;
    end if;
    v_discount := case v_coupon.type
                    when 'flat' then v_coupon.value
                    else least(round(v_items_total * v_coupon.value / 100, 2),
                               coalesce(v_coupon.max_discount, v_items_total))
                  end;
    v_discount := least(v_discount, v_items_total);
  end if;

  -- Fees and total
  v_fee := v_set.delivery_base_fee + round(v_set.delivery_per_km * v_dist);
  if v_set.free_delivery_above is not null and v_items_total >= v_set.free_delivery_above then
    v_fee := 0;
  end if;
  v_total := greatest(v_items_total + v_fee + v_set.platform_fee - v_discount, 0);

  if p_payment_mode = 'cod' and v_total > v_set.cod_limit then
    raise exception 'Cash on delivery is available up to ₹%. Please pay online.', v_set.cod_limit;
  end if;

  update public.orders set
    items_total       = v_items_total,
    delivery_fee      = v_fee,
    platform_fee      = v_set.platform_fee,
    discount          = v_discount,
    total             = v_total,
    commission_amount = round(v_items_total * coalesce(v_shop.commission_pct, v_set.commission_pct) / 100, 2),
    coupon_id         = v_coupon.id
  where id = v_order_id;

  insert into public.order_secrets (order_id, delivery_otp)
  values (v_order_id, lpad(floor(random() * 10000)::int::text, 4, '0'));

  -- Online orders stay payment_status = 'pending' until the Razorpay
  -- webhook (Supabase Edge Function) marks them 'paid'.
  return v_order_id;
end;
$$;

-- Internal: put the stock of a failed order back
create or replace function public.restore_stock(p_order_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.products p
  set stock = p.stock + i.qty
  from public.order_items i
  where i.order_id = p_order_id and i.product_id = p.id;
$$;

-- Internal: ping the nearest online, free, approved rider
create or replace function public.assign_nearest_agent(p_order_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_shop   public.shops%rowtype;
  v_agent  uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_shop  from public.shops  where id = v_order.shop_id;

  select da.id into v_agent
  from public.delivery_agents da
  join public.profiles p on p.id = da.id
  where p.status = 'active'
    and da.is_online and not da.is_busy
    and da.lat is not null
    and da.location_at > now() - interval '10 minutes'   -- ignore stale GPS
    and not (da.id = any (v_order.declined_agents))
    and not exists (select 1 from public.orders x
                    where x.agent_id = da.id and x.agent_state = 'requested')
  order by public.distance_km(v_shop.lat, v_shop.lng, da.lat, da.lng)
  limit 1
  for update of da skip locked;

  update public.orders set
    agent_id           = v_agent,
    agent_state        = case when v_agent is null then 'searching'::public.agent_state
                              else 'requested'::public.agent_state end,
    agent_requested_at = case when v_agent is null then null else now() end
  where id = p_order_id;

  return v_agent;
end;
$$;

-- 7c. Shop owner actions: 'accept' | 'reject' | 'packed'
create or replace function public.vendor_update_order(p_order_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select o.* into v_order
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = p_order_id and s.owner_id = auth.uid()
  for update of o;
  if not found then
    raise exception 'Order not found';
  end if;

  if p_action = 'accept' and v_order.status = 'placed' then
    update public.orders set status = 'accepted', accepted_at = now() where id = p_order_id;
    perform public.assign_nearest_agent(p_order_id);

  elsif p_action = 'reject' and v_order.status = 'placed' then
    update public.orders set
      status         = 'rejected',
      cancel_reason  = coalesce(p_reason, 'Rejected by shop'),
      payment_status = case when payment_status = 'paid' then 'refund_pending'::public.payment_status
                            else payment_status end
    where id = p_order_id;
    perform public.restore_stock(p_order_id);

  elsif p_action = 'packed' and v_order.status = 'accepted' then
    update public.orders set status = 'packed', packed_at = now() where id = p_order_id;

  else
    raise exception 'Cannot % an order that is %', p_action, v_order.status;
  end if;
end;
$$;

-- 7d. Customer cancels (only before the shop accepts)
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'The shop has already started this order, so it cannot be cancelled here';
  end if;

  update public.orders set
    status         = 'cancelled',
    cancel_reason  = coalesce(p_reason, 'Cancelled by customer'),
    payment_status = case when payment_status = 'paid' then 'refund_pending'::public.payment_status
                          else payment_status end
  where id = p_order_id;
  perform public.restore_stock(p_order_id);
end;
$$;

-- 7e. Rider actions: 'accept' | 'decline' | 'reached_shop' | 'picked_up' | 'delivered' (needs p_otp)
create or replace function public.agent_update_order(p_order_id uuid, p_action text, p_otp text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders%rowtype;
  v_set   public.platform_settings%rowtype;
  v_otp   text;
begin
  select * into v_order from public.orders
  where id = p_order_id and agent_id = v_uid
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if p_action = 'accept' and v_order.agent_state = 'requested' then
    update public.orders set agent_state = 'assigned' where id = p_order_id;
    update public.delivery_agents set is_busy = true where id = v_uid;

  elsif p_action = 'decline' and v_order.agent_state = 'requested' then
    update public.orders set declined_agents = array_append(declined_agents, v_uid) where id = p_order_id;
    perform public.assign_nearest_agent(p_order_id);

  elsif p_action = 'reached_shop' and v_order.agent_state = 'assigned' then
    update public.orders set agent_state = 'at_shop' where id = p_order_id;

  elsif p_action = 'picked_up' and v_order.agent_state in ('assigned', 'at_shop') then
    if v_order.status <> 'packed' then
      raise exception 'The shop has not marked this order packed yet';
    end if;
    update public.orders set status = 'picked_up', agent_state = 'picked', picked_up_at = now()
    where id = p_order_id;

  elsif p_action = 'delivered' and v_order.agent_state = 'picked' then
    select delivery_otp into v_otp from public.order_secrets where order_id = p_order_id;
    if p_otp is null or trim(p_otp) <> v_otp then
      raise exception 'OTP does not match. Ask the customer for the 4-digit code.';
    end if;

    select * into v_set from public.platform_settings where id = 1;

    update public.orders set
      status         = 'delivered',
      agent_state    = 'done',
      delivered_at   = now(),
      payment_status = case when payment_mode = 'cod' then 'paid'::public.payment_status
                            else payment_status end
    where id = p_order_id;

    update public.delivery_agents set
      is_busy        = false,
      cash_in_hand   = cash_in_hand + case when v_order.payment_mode = 'cod' then v_order.total else 0 end,
      earnings_total = earnings_total + round(v_order.delivery_fee * v_set.rider_share_pct / 100, 2)
    where id = v_uid;

  else
    raise exception 'Cannot % this order right now', replace(p_action, '_', ' ');
  end if;
end;
$$;

-- 7f. Re-ping riders who did not answer in time, and retry orders that
-- found no rider. Schedule it (see the pg_cron note at the end).
create or replace function public.reassign_stale_requests()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_secs  int;
  v_order record;
  v_count int := 0;
begin
  select agent_accept_seconds into v_secs from public.platform_settings where id = 1;

  for v_order in
    select id, agent_id, agent_state from public.orders
    where status in ('accepted', 'packed')
      and (agent_state = 'searching'
           or (agent_state = 'requested'
               and agent_requested_at < now() - make_interval(secs => v_secs)))
    for update skip locked
  loop
    if v_order.agent_state = 'requested' then
      update public.orders set declined_agents = array_append(declined_agents, v_order.agent_id)
      where id = v_order.id;
    end if;
    perform public.assign_nearest_agent(v_order.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 7g. Admin records COD cash handed in by a rider
create or replace function public.admin_record_cod_deposit(p_agent_id uuid, p_amount numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can record deposits';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be more than zero';
  end if;

  update public.delivery_agents
  set cash_in_hand = cash_in_hand - p_amount
  where id = p_agent_id and cash_in_hand >= p_amount;
  if not found then
    raise exception 'Rider does not hold that much cash';
  end if;

  insert into public.transactions (type, user_id, amount, note, created_by)
  values ('cod_deposit', p_agent_id, p_amount, p_note, auth.uid());
end;
$$;

-- 7h. Customer rates a delivered order
create or replace function public.rate_order(p_order_id uuid, p_shop_rating int, p_agent_rating int default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_id = auth.uid() and status = 'delivered' and shop_rating is null
  for update;
  if not found then
    raise exception 'This order cannot be rated';
  end if;
  if p_shop_rating not between 1 and 5 or (p_agent_rating is not null and p_agent_rating not between 1 and 5) then
    raise exception 'Ratings must be between 1 and 5';
  end if;

  update public.orders set shop_rating = p_shop_rating, agent_rating = p_agent_rating where id = p_order_id;

  update public.shops set
    rating       = round((rating * rating_count + p_shop_rating) / (rating_count + 1), 2),
    rating_count = rating_count + 1
  where id = v_order.shop_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. FUNCTION PERMISSIONS
-- ---------------------------------------------------------------------
-- Internal helpers: nobody calls these from an app
revoke execute on function public.restore_stock(uuid)          from public, anon, authenticated;
revoke execute on function public.assign_nearest_agent(uuid)   from public, anon, authenticated;
revoke execute on function public.reassign_stale_requests()    from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;

-- App functions: logged-in users only
revoke execute on function public.place_order(uuid, uuid, jsonb, public.payment_mode, text) from public, anon;
revoke execute on function public.vendor_update_order(uuid, text, text)                    from public, anon;
revoke execute on function public.customer_cancel_order(uuid, text)                        from public, anon;
revoke execute on function public.agent_update_order(uuid, text, text)                     from public, anon;
revoke execute on function public.admin_record_cod_deposit(uuid, numeric, text)            from public, anon;
revoke execute on function public.rate_order(uuid, int, int)                               from public, anon;

grant execute on function public.place_order(uuid, uuid, jsonb, public.payment_mode, text) to authenticated;
grant execute on function public.vendor_update_order(uuid, text, text)                    to authenticated;
grant execute on function public.customer_cancel_order(uuid, text)                        to authenticated;
grant execute on function public.agent_update_order(uuid, text, text)                     to authenticated;
grant execute on function public.admin_record_cod_deposit(uuid, numeric, text)            to authenticated;
grant execute on function public.rate_order(uuid, int, int)                               to authenticated;
-- nearby_shops stays open to everyone so the home screen works before login


-- ---------------------------------------------------------------------
-- 9. STORAGE BUCKETS (images and KYC documents)
-- ---------------------------------------------------------------------
-- Folder rules:
--   product-images/<shop_id>/<file>.webp   (public)
--   shop-logos/<shop_id>/<file>.webp       (public)
--   banners/<file>.webp                    (public, admin uploads)
--   kyc-docs/<user_id>/<file>              (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true,  2097152,  array['image/webp', 'image/jpeg', 'image/png']),
  ('shop-logos',     'shop-logos',     true,  1048576,  array['image/webp', 'image/jpeg', 'image/png']),
  ('banners',        'banners',        true,  3145728,  array['image/webp', 'image/jpeg', 'image/png']),
  ('kyc-docs',       'kyc-docs',       false, 5242880,  array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy "storage: public images readable" on storage.objects for select
  using (bucket_id in ('product-images', 'shop-logos', 'banners'));

create policy "storage: owners upload shop images" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('product-images', 'shop-logos')
    and exists (select 1 from public.shops s
                where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()));

create policy "storage: owners change shop images" on storage.objects for update to authenticated
  using (
    bucket_id in ('product-images', 'shop-logos')
    and exists (select 1 from public.shops s
                where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()));

create policy "storage: owners delete shop images" on storage.objects for delete to authenticated
  using (
    bucket_id in ('product-images', 'shop-logos')
    and exists (select 1 from public.shops s
                where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()));

create policy "storage: admin manages banners" on storage.objects for all to authenticated
  using (bucket_id = 'banners' and public.is_admin())
  with check (bucket_id = 'banners' and public.is_admin());

create policy "storage: users upload own kyc" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage: users and admin read kyc" on storage.objects for select to authenticated
  using (bucket_id = 'kyc-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));


-- ---------------------------------------------------------------------
-- 10. REALTIME (live order alerts and rider tracking)
-- ---------------------------------------------------------------------
-- Realtime respects RLS, so each user only receives rows they can read.
alter publication supabase_realtime add table public.orders, public.delivery_agents;


-- ---------------------------------------------------------------------
-- 11. STARTER DATA
-- ---------------------------------------------------------------------
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

insert into public.categories (name, sort) values
  ('Grocery & Staples', 1),
  ('Fruits & Vegetables', 2),
  ('Dairy & Bakery', 3),
  ('Sweets & Snacks', 4),
  ('Meat & Fish', 5),
  ('Pharmacy', 6),
  ('Personal Care', 7),
  ('Household', 8),
  ('Stationery', 9),
  ('Electronics & Mobile', 10)
on conflict (name) do nothing;


-- =====================================================================
-- AFTER RUNNING THIS SCRIPT
--
-- 1. Make yourself admin: sign up once in your app (or Authentication →
--    Users → Add user in the dashboard), then run:
--
--      update public.profiles set role = 'admin', status = 'active'
--      where email = 'you@example.com';
--
-- 2. Rider auto-reassign every 30 seconds: Database → Extensions →
--    enable pg_cron, then run:
--
--      select cron.schedule('reassign-riders', '30 seconds',
--                           $$ select public.reassign_stale_requests(); $$);
--
-- 3. Online payments: create a Razorpay order from a Supabase Edge
--    Function, and on the payment webhook set
--    orders.payment_status = 'paid' and payment_ref = <payment id>.
--    Keep the Razorpay secret key in Edge Function secrets, never in the app.
-- =====================================================================
