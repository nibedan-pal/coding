import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { supabase, subscribe } from '../lib/supabase';
import { STATUS, orderNo } from '../lib/format';
import { Button, C, Card, Empty, Pill, Screen, Thumb, s } from '../ui';
import PushNotice from '../components/PushNotice';
import CartBar from './CartBar';

const ACTIVE = ['placed', 'accepted', 'packed', 'picked_up'];

export default function HomeScreen({ userId, profile, address, cart, cartApi, push, signOut, pushStatus }) {
  const [shops, setShops] = useState(null);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState(null);
  const [active, setActive] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: sh }, { data: cs }, { data: os }] = await Promise.all([
      supabase.rpc('nearby_shops', { p_lat: address.lat, p_lng: address.lng }),
      supabase.from('categories').select('id,name').order('sort'),
      supabase
        .from('orders')
        .select('id, order_no, status, shops(name)')
        .eq('customer_id', userId)
        .in('status', ACTIVE)
        .order('placed_at', { ascending: false }),
    ]);
    setShops(sh ?? []);
    setCats(cs ?? []);
    setActive(os ?? []);
  }, [address.id, userId]);

  useEffect(() => {
    load();
    return subscribe('home-orders', ['orders'], load);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const usedCats = cats.filter((c) => (shops || []).some((x) => x.category_id === c.id));
  const list = (shops || []).filter((x) => !cat || x.category_id === cat);

  return (
    <Screen
      title={`Hi ${profile.full_name?.split(' ')[0] || 'there'}`}
      subtitle={`${address.label} · ${address.line1}`}
      right={<Button small kind="ghost" title="Orders" onPress={() => push('orders')} />}
      refreshing={refreshing}
      onRefresh={refresh}
      footer={cartApi.count ? <CartBar cart={cart} cartApi={cartApi} onPress={() => push('cart')} /> : null}
    >
      <PushNotice status={pushStatus} />

      {active.map((o) => (
        <Card key={o.id} accent={C.warn} onPress={() => push('track', { orderId: o.id })}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.strong}>{orderNo(o)} · {o.shops?.name}</Text>
            <Pill text={STATUS[o.status].label} tone={STATUS[o.status].tone} />
          </View>
          <Text style={s.small}>Tap to track your order</Text>
        </Card>
      ))}

      <Pressable onPress={() => push('address')}>
        <Text style={[s.small, { color: C.accent, fontWeight: '700' }]}>Change delivery address</Text>
      </Pressable>

      {usedCats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null, name: 'All' }, ...usedCats].map((c) => (
            <Pressable
              key={String(c.id)}
              onPress={() => setCat(c.id)}
              style={[s.tab, cat === c.id && { backgroundColor: C.accentSoft, borderColor: C.accent }]}
            >
              <Text style={[s.tabText, cat === c.id && { color: C.accent }]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Text style={s.h2}>Shops near you</Text>
      {shops === null ? (
        <Text style={s.small}>Finding shops…</Text>
      ) : list.length === 0 ? (
        <Empty text="No shops deliver to this address yet. LocalKart is adding shops in your area. Pull down to refresh." />
      ) : (
        list.map((x) => (
          <Card key={x.shop_id} onPress={() => push('shop', { shopId: x.shop_id })} style={!x.is_open && { opacity: 0.6 }}>
            <View style={s.row}>
              <Thumb uri={x.logo_url} letter={x.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{x.name}</Text>
                <Text style={s.small}>
                  {cats.find((c) => c.id === x.category_id)?.name || 'Shop'} · {x.distance_km} km
                  {Number(x.rating) > 0 ? ` · ★ ${Number(x.rating).toFixed(1)}` : ''}
                </Text>
              </View>
              {x.is_open ? <Pill text={`${x.eta_minutes} min`} tone="warn" /> : <Pill text="Closed" tone="mute" />}
            </View>
          </Card>
        ))
      )}

      <Button title="Log out" kind="ghost" small onPress={signOut} style={{ marginTop: 16 }} />
    </Screen>
  );
}
