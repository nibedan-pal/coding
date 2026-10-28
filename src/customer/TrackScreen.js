import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { rpc, supabase, subscribe, errorText } from '../lib/supabase';
import { STATUS, orderNo, rupees, timeText } from '../lib/format';
import { Button, C, Card, Empty, Pill, Screen, s } from '../ui';
import MapView from '../components/MapView';

const STEPS = [
  ['placed', 'Order placed'],
  ['accepted', 'Shop accepted'],
  ['packed', 'Packed'],
  ['picked_up', 'Out for delivery'],
  ['delivered', 'Delivered'],
];
const RIDER_VISIBLE = ['assigned', 'at_shop', 'picked'];

export default function TrackScreen({ orderId, pop }) {
  const [o, setO] = useState(null);
  const [rider, setRider] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shopStars, setShopStars] = useState(0);
  const [riderStars, setRiderStars] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, shops(name, phone, lat, lng, address), addresses(line1, city, lat, lng), order_items(name, qty, price, unit), order_secrets(delivery_otp)')
      .eq('id', orderId)
      .maybeSingle();
    setO(data);
    if (data?.agent_id && RIDER_VISIBLE.includes(data.agent_state)) {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', data.agent_id).maybeSingle(),
        supabase.from('delivery_agents').select('lat, lng, vehicle_type, location_at').eq('id', data.agent_id).maybeSingle(),
      ]);
      setRider({ ...(p || {}), ...(a || {}) });
    } else {
      setRider(null);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    return subscribe(`track-${orderId}`, ['orders', 'delivery_agents'], load);
  }, [load]);

  if (!o) return <Screen title="Order" onBack={pop}><Text style={s.small}>Loading…</Text></Screen>;

  const secret = Array.isArray(o.order_secrets) ? o.order_secrets[0] : o.order_secrets;
  const stepIdx = STEPS.findIndex(([k]) => k === o.status);
  const ended = ['rejected', 'cancelled', 'failed'].includes(o.status);
  const st = STATUS[o.status];

  async function cancel() {
    Alert.alert('Cancel this order?', 'The shop has not started on it yet.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await rpc('customer_cancel_order', { p_order_id: o.id, p_reason: null });
            await load();
          } catch (e) {
            Alert.alert('Could not cancel', errorText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function rate() {
    if (!shopStars) return Alert.alert('Rate the shop', 'Tap a star for the shop first.');
    setBusy(true);
    try {
      await rpc('rate_order', { p_order_id: o.id, p_shop_rating: shopStars, p_agent_rating: riderStars || null });
      await load();
    } catch (e) {
      Alert.alert('Could not save rating', errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const markers = [
    o.shops && { lat: o.shops.lat, lng: o.shops.lng, label: o.shops.name, color: '#b86e00' },
    o.addresses && { lat: o.addresses.lat, lng: o.addresses.lng, label: 'You', color: '#0d7a4e' },
    rider?.lat && { lat: rider.lat, lng: rider.lng, label: rider.full_name?.split(' ')[0] || 'Rider', color: '#2f6fb5' },
  ].filter(Boolean);

  return (
    <Screen title={orderNo(o)} subtitle={`${o.shops?.name} · ${timeText(o.placed_at)}`} onBack={pop}>
      <View style={s.row}>
        <Pill text={st.label} tone={st.tone} />
      </View>

      {ended ? (
        <Empty
          text={
            o.status === 'rejected'
              ? `The shop could not take this order.${o.payment_mode === 'online' ? ' Your refund has started.' : ''}`
              : 'This order was cancelled.'
          }
        />
      ) : (
        <>
          {o.status !== 'delivered' && secret?.delivery_otp ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={s.small}>Share this code with the rider</Text>
                <Text style={s.otp}>{secret.delivery_otp}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.small}>{o.payment_mode === 'cod' ? 'Pay on delivery' : 'Paid online'}</Text>
                <Text style={s.price}>{rupees(o.total)}</Text>
              </View>
            </Card>
          ) : null}

          <Card>
            {STEPS.map(([k, label], i) => {
              const done = i < stepIdx || o.status === 'delivered';
              const now = i === stepIdx && o.status !== 'delivered';
              return (
                <View key={k} style={[s.row, { alignItems: 'flex-start', paddingVertical: 4 }]}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      marginTop: 2,
                      borderWidth: 2,
                      borderColor: done || now ? C.accent : C.line,
                      backgroundColor: done ? C.accent : '#fff',
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.text, (done || now) && { fontWeight: '700' }, !done && !now && { color: C.muted }]}>
                      {label}
                    </Text>
                    {k === 'picked_up' && rider ? (
                      <Text style={s.small}>
                        {rider.full_name} · {rider.vehicle_type}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {['accepted', 'packed'].includes(o.status) && !rider ? (
              <Text style={s.small}>
                {o.agent_state === 'searching'
                  ? 'All riders nearby are busy. We will assign one as soon as someone is free.'
                  : 'Finding a rider near the shop…'}
              </Text>
            ) : null}
          </Card>

          {markers.length ? <MapView markers={markers} /> : null}

          {rider?.phone ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={s.strong}>{rider.full_name}</Text>
                <Text style={s.small}>Your delivery partner · {rider.phone}</Text>
              </View>
              <Button small kind="soft" title="Call" onPress={() => Linking.openURL(`tel:${rider.phone}`)} />
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <Text style={s.label}>ITEMS</Text>
        {o.order_items.map((i, idx) => (
          <View key={idx} style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.text, { flex: 1 }]}>
              {i.qty}× {i.name} <Text style={s.small}>({i.unit})</Text>
            </Text>
            <Text style={s.text}>{rupees(i.qty * i.price)}</Text>
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 6, gap: 2 }}>
          <Text style={s.small}>
            Items {rupees(o.items_total)} · Delivery {rupees(o.delivery_fee)} · Platform {rupees(o.platform_fee)}
            {Number(o.discount) > 0 ? ` · Discount −${rupees(o.discount)}` : ''}
          </Text>
          <Text style={s.strong}>Total {rupees(o.total)}</Text>
        </View>
      </Card>

      {o.status === 'placed' ? <Button title="Cancel order" kind="danger" onPress={cancel} loading={busy} /> : null}

      {o.status === 'delivered' && !o.shop_rating ? (
        <Card>
          <Text style={s.h2}>How was your order?</Text>
          <Stars label={o.shops?.name} value={shopStars} onChange={setShopStars} />
          {o.agent_id ? <Stars label="Delivery" value={riderStars} onChange={setRiderStars} /> : null}
          <Button title="Submit rating" onPress={rate} loading={busy} />
        </Card>
      ) : null}
      {o.shop_rating ? <Text style={s.small}>You rated this order {o.shop_rating}★. Thank you!</Text> : null}
    </Screen>
  );
}

function Stars({ label, value, onChange }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.small}>{label}</Text>
      <View style={s.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityLabel={`${n} stars`}>
            <Text style={{ fontSize: 30, color: n <= value ? '#e0a100' : C.line }}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
