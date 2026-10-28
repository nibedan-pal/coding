import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Banner, Loading, Screen, Tabs } from '../ui';
import PushNotice from '../components/PushNotice';
import ShopSetup from './ShopSetup';
import OrdersTab from './OrdersTab';
import ProductsTab from './ProductsTab';
import ShopTab from './ShopTab';

export default function PartnerApp({ session, profile, reloadProfile, signOut, pushStatus }) {
  const userId = session.user.id;
  const [shop, setShop] = useState(undefined);
  const [tab, setTab] = useState('orders');
  const [newCount, setNewCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0); // bump to make tabs reload on pull-to-refresh

  const loadShop = useCallback(async () => {
    const { data } = await supabase.from('shops').select('*').eq('owner_id', userId).maybeSingle();
    setShop(data ?? null);
  }, [userId]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  if (shop === undefined) return <Loading />;
  if (shop === null) return <ShopSetup userId={userId} onCreated={loadShop} signOut={signOut} />;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadShop(), reloadProfile()]);
    setTick((t) => t + 1);
    setRefreshing(false);
  };

  const pending = shop.status !== 'approved' || profile.status !== 'active';

  return (
    <Screen
      title={shop.name}
      subtitle={shop.is_open ? 'Open · taking orders' : 'Closed · not taking orders'}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {pending ? (
        <Banner
          text={
            shop.status === 'rejected' || shop.status === 'suspended'
              ? 'Your shop is not active. Contact LocalKart support.'
              : 'Your shop is waiting for approval by LocalKart. Add your products now; customers will see your shop once it is approved.'
          }
        />
      ) : null}
      <PushNotice status={pushStatus} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'orders', label: 'Orders', badge: newCount || null },
          { key: 'products', label: 'Products' },
          { key: 'shop', label: 'Shop' },
        ]}
      />
      {/* Orders stays mounted so new-order alerts keep working on other tabs */}
      <OrdersTab shop={shop} visible={tab === 'orders'} onNewCount={setNewCount} tick={tick} />
      {tab === 'products' ? <ProductsTab shop={shop} tick={tick} /> : null}
      {tab === 'shop' ? <ShopTab shop={shop} onChanged={loadShop} signOut={signOut} tick={tick} /> : null}
    </Screen>
  );
}
