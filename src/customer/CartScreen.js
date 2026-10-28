import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { rpc, supabase, errorText } from '../lib/supabase';
import { distanceKm, rupees } from '../lib/format';
import { Button, C, Card, Field, Qty, Screen, s } from '../ui';

export default function CartScreen({ address, cart, cartApi, pop, reset }) {
  const [settings, setSettings] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [pay, setPay] = useState('cod');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSettings(data));
  }, []);

  useEffect(() => {
    if (!cartApi.count) pop();
  }, [cartApi.count]);

  if (!cart.shop) return null;
  const shop = cart.shop;
  const lines = Object.values(cart.items);
  const dist = distanceKm(address.lat, address.lng, shop.lat, shop.lng);
  const itemsTotal = cartApi.total;
  const savings = lines.reduce((n, l) => n + (Number(l.product.mrp) - Number(l.product.price)) * l.qty, 0);
  let fee = settings ? Number(settings.delivery_base_fee) + Math.round(Number(settings.delivery_per_km) * dist) : 0;
  if (settings?.free_delivery_above && itemsTotal >= Number(settings.free_delivery_above)) fee = 0;
  const platform = settings ? Number(settings.platform_fee) : 0;
  const total = itemsTotal + fee + platform;
  const tooFar = dist > Number(shop.delivery_radius_km);

  async function place() {
    setPlacing(true);
    try {
      const orderId = await rpc('place_order', {
        p_shop_id: shop.id,
        p_address_id: address.id,
        p_items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        p_payment_mode: pay,
        p_coupon_code: coupon.trim() || null,
      });
      cartApi.clear();
      reset('track', { orderId });
    } catch (e) {
      Alert.alert('Could not place order', errorText(e));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <Screen
      title="Checkout"
      subtitle={`From ${shop.name}`}
      onBack={pop}
      footer={
        <Button
          title={`Place order · ${rupees(total)}`}
          onPress={place}
          loading={placing}
          disabled={!settings || tooFar || !shop.is_open}
        />
      }
    >
      <Card>
        {lines.map((l) => (
          <View key={l.product.id} style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.strong} numberOfLines={1}>{l.product.name}</Text>
              <Text style={s.small}>
                {l.product.unit} · {rupees(l.product.price)}
              </Text>
            </View>
            <View style={{ width: 110 }}>
              <Qty
                qty={l.qty}
                max={l.product.stock}
                onAdd={() => cartApi.add(shop, l.product)}
                onRemove={() => cartApi.remove(l.product.id)}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={s.label}>DELIVER TO</Text>
        <Text style={s.text}>
          {address.label} · {address.line1}, {address.city} {address.pincode}
        </Text>
        {tooFar ? <Text style={{ color: C.bad }}>This shop does not deliver to this address ({dist} km away).</Text> : null}
      </Card>

      <Field label="Coupon code (optional)" value={coupon} onChangeText={setCoupon} autoCapitalize="characters" placeholder="FIRST50" />

      <Card>
        <Row k="Item total" v={rupees(itemsTotal)} />
        <Row k={`Delivery fee (${dist} km)`} v={fee ? rupees(fee) : 'Free'} />
        <Row k="Platform fee" v={rupees(platform)} />
        {savings > 0 ? <Row k="You save on MRP" v={rupees(savings)} good /> : null}
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.line, marginTop: 4, paddingTop: 8 }}>
          <Row k="To pay" v={rupees(total)} bold />
        </View>
        {coupon.trim() ? <Text style={s.small}>Coupon discount is applied when you place the order.</Text> : null}
      </Card>

      <Text style={s.label}>PAYMENT</Text>
      <PayOption on={pay === 'cod'} onPress={() => setPay('cod')} title="Cash on delivery" sub="Pay the rider in cash or UPI at your door" />
      <PayOption on={false} disabled title="Pay online" sub="UPI, cards and netbanking are coming soon" />
    </Screen>
  );
}

function Row({ k, v, bold, good }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <Text style={[s.text, bold && { fontWeight: '800' }, good && { color: C.good }]}>{k}</Text>
      <Text style={[s.text, bold && { fontWeight: '800', fontSize: 17 }, good && { color: C.good }]}>{v}</Text>
    </View>
  );
}

function PayOption({ on, onPress, title, sub, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        s.card,
        { flexDirection: 'row', gap: 12, alignItems: 'center' },
        on && { borderColor: C.accent, backgroundColor: C.accentSoft },
        disabled && { opacity: 0.5 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: on ? C.accent : C.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{title}</Text>
        <Text style={s.small}>{sub}</Text>
      </View>
    </Pressable>
  );
}
