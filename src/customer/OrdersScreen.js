import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase, subscribe } from '../lib/supabase';
import { STATUS, itemsLine, orderNo, rupees, timeText } from '../lib/format';
import { Card, Empty, Pill, Screen, s } from '../ui';

export default function OrdersScreen({ userId, push, pop }) {
  const [orders, setOrders] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_no, status, total, placed_at, shops(name), order_items(name, qty)')
      .eq('customer_id', userId)
      .order('placed_at', { ascending: false })
      .limit(50);
    setOrders(data ?? []);
  }, [userId]);

  useEffect(() => {
    load();
    return subscribe('my-orders', ['orders'], load);
  }, [load]);

  return (
    <Screen
      title="My orders"
      onBack={pop}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {orders === null ? (
        <Text style={s.small}>Loading…</Text>
      ) : orders.length === 0 ? (
        <Empty text="No orders yet. Pick a shop near you to place your first order." />
      ) : (
        orders.map((o) => (
          <Card key={o.id} onPress={() => push('track', { orderId: o.id })}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.strong}>{o.shops?.name}</Text>
              <Pill text={STATUS[o.status].label} tone={STATUS[o.status].tone} />
            </View>
            <Text style={s.small} numberOfLines={2}>{itemsLine(o.order_items)}</Text>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.small}>
                {orderNo(o)} · {timeText(o.placed_at)}
              </Text>
              <Text style={s.strong}>{rupees(o.total)}</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
