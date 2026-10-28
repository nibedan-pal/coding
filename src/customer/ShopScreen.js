import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { distanceKm, rupees } from '../lib/format';
import { C, Empty, Field, Pill, Qty, Screen, Thumb, s } from '../ui';
import CartBar from './CartBar';

export default function ShopScreen({ shopId, address, cart, cartApi, push, pop }) {
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: sh }, { data: ps }] = await Promise.all([
        supabase.from('shops').select('*').eq('id', shopId).maybeSingle(),
        supabase.from('products').select('*').eq('shop_id', shopId).eq('is_active', true).order('name'),
      ]);
      setShop(sh);
      setProducts(ps ?? []);
    })();
  }, [shopId]);

  function add(p) {
    if (cartApi.add(shop, p) === 'other-shop') {
      Alert.alert(
        'Start a new cart?',
        `Your cart has items from ${cart.shop.name}. One order comes from one shop so it can reach you in minutes.`,
        [
          { text: 'Keep current cart', style: 'cancel' },
          { text: 'Clear and add', onPress: () => cartApi.add(shop, p, true) },
        ],
      );
    }
  }

  if (!shop) return <Screen title="Shop" onBack={pop}><Text style={s.small}>Loading…</Text></Screen>;

  const dist = distanceKm(address.lat, address.lng, shop.lat, shop.lng);
  const list = (products || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen
      title={shop.name}
      subtitle={`${dist} km · ${shop.is_open ? 'Open now' : 'Closed'}${Number(shop.rating) > 0 ? ` · ★ ${Number(shop.rating).toFixed(1)}` : ''}`}
      onBack={pop}
      footer={cartApi.count ? <CartBar cart={cart} cartApi={cartApi} onPress={() => push('cart')} /> : null}
    >
      {!shop.is_open ? <Empty text="This shop is closed right now. You can browse, but ordering opens when the shop does." /> : null}
      {(products || []).length > 6 ? (
        <Field value={q} onChangeText={setQ} placeholder={`Search in ${shop.name}`} autoCapitalize="none" />
      ) : null}
      {products === null ? (
        <Text style={s.small}>Loading products…</Text>
      ) : list.length === 0 ? (
        <Empty text={q ? 'No product matches your search.' : 'This shop has not added products yet.'} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {list.map((p) => (
            <View key={p.id} style={[s.card, { width: '48%', padding: 10 }]}>
              <View style={{ alignItems: 'center' }}>
                <Thumb uri={p.images?.[0]} letter={p.name} size={110} />
              </View>
              <Text style={[s.strong, { fontSize: 14, minHeight: 38 }]} numberOfLines={2}>{p.name}</Text>
              <Text style={s.small}>{p.unit}</Text>
              <View style={[s.row, { gap: 6 }]}>
                <Text style={s.price}>{rupees(p.price)}</Text>
                {Number(p.mrp) > Number(p.price) ? <Text style={s.mrp}>{rupees(p.mrp)}</Text> : null}
              </View>
              {p.stock <= 0 ? (
                <Pill text="Out of stock" tone="mute" />
              ) : shop.is_open ? (
                <Qty
                  qty={cart.shop?.id === shop.id ? cartApi.qty(p.id) : 0}
                  max={p.stock}
                  onAdd={() => add(p)}
                  onRemove={() => cartApi.remove(p.id)}
                />
              ) : null}
              {p.stock > 0 && p.stock <= 5 ? <Text style={[s.small, { color: C.warn }]}>Only {p.stock} left</Text> : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
