import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, Vibration, View } from 'react-native';
import { rpc, supabase, subscribe, errorText } from '../lib/supabase';
import { STATUS, orderNo, rupees, timeText } from '../lib/format';
import { Button, C, Card, Empty, Pill, s } from '../ui';

const RIDER_TEXT = {
  requested: 'Pinging a rider…',
  searching: 'Waiting for a free rider',
  assigned: 'Rider on the way to you',
  at_shop: 'Rider is at your shop',
  picked: 'Rider has the order',
};

export default function OrdersTab({ shop, visible, onNewCount, tick }) {
  const [orders, setOrders] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const lastNew = useRef(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 2 * 86400000).toISOString();
    const { data } = await supabase
      .from('orders')
      .select('id, order_no, status, agent_state, items_total, total, payment_mode, placed_at, order_items(name, qty, unit)')
      .eq('shop_id', shop.id)
      .or(`placed_at.gte.${since},status.in.(placed,accepted,packed,picked_up)`)
      .order('placed_at', { ascending: false });
    const list = data ?? [];
    setOrders(list);
    const n = list.filter((o) => o.status === 'placed').length;
    // Buzz when a new order arrives while the app is open
    if (lastNew.current !== null && n > lastNew.current) Vibration.vibrate([0, 500, 250, 500]);
    lastNew.current = n;
    onNewCount(n);
  }, [shop.id]);

  useEffect(() => {
    load();
    return subscribe(`shop-orders-${shop.id}`, ['orders'], load);
  }, [load, tick]);

  async function act(o, action) {
    setBusyId(o.id + action);
    try {
      await rpc('vendor_update_order', { p_order_id: o.id, p_action: action, p_reason: null });
      await load();
    } catch (e) {
      Alert.alert('Could not update order', errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  function reject(o) {
    Alert.alert('Reject this order?', 'The customer will be told the shop could not take it.', [
      { text: 'Go back', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => act(o, 'reject') },
    ]);
  }

  if (!visible) return null;
  if (orders === null) return <Text style={s.small}>Loading orders…</Text>;

  const fresh = orders.filter((o) => o.status === 'placed');
  const active = orders.filter((o) => ['accepted', 'packed', 'picked_up'].includes(o.status));
  const past = orders.filter((o) => ['delivered', 'rejected', 'cancelled', 'failed'].includes(o.status));

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.h2}>New orders</Text>
      {fresh.length === 0 ? (
        <Empty text={shop.is_open ? 'No new orders right now. You will get a notification when one comes in.' : 'Your shop is closed. Open it from the Shop tab to receive orders.'} />
      ) : (
        fresh.map((o) => (
          <OrderCard key={o.id} o={o} accent={C.warn}>
            <View style={[s.row, { gap: 8 }]}>
              <Button title="Accept" style={{ flex: 1 }} onPress={() => act(o, 'accept')} loading={busyId === o.id + 'accept'} />
              <Button title="Reject" kind="danger" onPress={() => reject(o)} loading={busyId === o.id + 'reject'} />
            </View>
          </OrderCard>
        ))
      )}

      <Text style={s.h2}>In progress</Text>
      {active.length === 0 ? (
        <Empty text="Nothing being packed." />
      ) : (
        active.map((o) => (
          <OrderCard key={o.id} o={o} accent={C.accent}>
            <Text style={s.small}>{RIDER_TEXT[o.agent_state] || ''}</Text>
            {o.status === 'accepted' ? (
              <Button title="Mark packed" onPress={() => act(o, 'packed')} loading={busyId === o.id + 'packed'} />
            ) : null}
          </OrderCard>
        ))
      )}

      {past.length ? <Text style={s.h2}>Last 2 days</Text> : null}
      {past.map((o) => (
        <OrderCard key={o.id} o={o} />
      ))}
    </View>
  );
}

function OrderCard({ o, accent, children }) {
  const st = STATUS[o.status];
  return (
    <Card accent={accent}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.strong}>{orderNo(o)}</Text>
        <Pill text={st.label} tone={st.tone} />
      </View>
      {o.order_items.map((i, idx) => (
        <Text key={idx} style={s.text}>
          <Text style={{ fontWeight: '800' }}>{i.qty}×</Text> {i.name} <Text style={s.small}>({i.unit})</Text>
        </Text>
      ))}
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.small}>
          {timeText(o.placed_at)} · {o.payment_mode === 'cod' ? 'Cash on delivery' : 'Paid online'}
        </Text>
        <Text style={s.strong}>{rupees(o.items_total)}</Text>
      </View>
      {children}
    </Card>
  );
}
