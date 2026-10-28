import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { supabase } from '../lib/supabase';
import { Loading } from '../ui';
import AddressScreen from './AddressScreen';
import HomeScreen from './HomeScreen';
import ShopScreen from './ShopScreen';
import CartScreen from './CartScreen';
import OrdersScreen from './OrdersScreen';
import TrackScreen from './TrackScreen';

export default function CustomerApp({ session, profile, signOut, pushStatus }) {
  const userId = session.user.id;
  const [stack, setStack] = useState([{ name: 'home' }]);
  const [addresses, setAddresses] = useState(null);
  const [cart, setCart] = useState({ shop: null, items: {} });

  const route = stack[stack.length - 1];
  const push = useCallback((name, params) => setStack((st) => [...st, { name, params }]), []);
  const pop = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const reset = useCallback((name, params) => setStack([{ name: 'home' }, ...(name === 'home' ? [] : [{ name, params }])]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const loadAddresses = useCallback(async () => {
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setAddresses(data ?? []);
  }, [userId]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const address = addresses?.[0] ?? null;

  // ---- cart (one shop at a time) ----
  const cartApi = useMemo(
    () => ({
      qty: (pid) => cart.items[pid]?.qty ?? 0,
      count: Object.values(cart.items).reduce((n, i) => n + i.qty, 0),
      total: Object.values(cart.items).reduce((n, i) => n + i.qty * Number(i.product.price), 0),
      add: (shop, product, force) => {
        if (cart.shop && cart.shop.id !== shop.id && Object.keys(cart.items).length && !force) return 'other-shop';
        setCart((c) => {
          const same = c.shop && c.shop.id === shop.id;
          const items = same ? { ...c.items } : {};
          const q = (items[product.id]?.qty ?? 0) + 1;
          if (q > product.stock) return c;
          items[product.id] = { product, qty: q };
          return { shop, items };
        });
        return 'ok';
      },
      remove: (pid) =>
        setCart((c) => {
          const items = { ...c.items };
          const q = (items[pid]?.qty ?? 0) - 1;
          if (q <= 0) delete items[pid];
          else items[pid] = { ...items[pid], qty: q };
          return Object.keys(items).length ? { ...c, items } : { shop: null, items: {} };
        }),
      clear: () => setCart({ shop: null, items: {} }),
    }),
    [cart],
  );

  if (addresses === null) return <Loading />;
  if (!address || route.name === 'address') {
    return (
      <AddressScreen
        userId={userId}
        addresses={addresses}
        first={!address}
        onDone={async () => {
          await loadAddresses();
          if (route.name === 'address') pop();
        }}
        onBack={address ? pop : null}
      />
    );
  }

  const common = { userId, profile, address, cart, cartApi, push, pop, reset, signOut, pushStatus };
  switch (route.name) {
    case 'shop':
      return <ShopScreen {...common} shopId={route.params.shopId} />;
    case 'cart':
      return <CartScreen {...common} />;
    case 'orders':
      return <OrdersScreen {...common} />;
    case 'track':
      return <TrackScreen {...common} orderId={route.params.orderId} />;
    default:
      return <HomeScreen {...common} />;
  }
}
