import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { rpc, supabase, subscribe, errorText } from '../lib/supabase';
import { currentPosition, watchPosition } from '../lib/location';
import { distanceKm, itemsLine, orderNo, rupees, timeText } from '../lib/format';
import { Banner, Button, C, Card, Empty, Field, Loading, Pill, Screen, Stat, ToggleRow, s } from '../ui';
import Pending from '../components/Pending';
import PushNotice from '../components/PushNotice';
import MapView from '../components/MapView';

const ORDER_FIELDS =
  'id, order_no, status, agent_state, agent_requested_at, total, delivery_fee, payment_mode, placed_at, delivered_at, address_id, customer_id, shops(name, address, phone, lat, lng), order_items(name, qty, unit)';

export default function RiderApp({ session, profile, reloadProfile, signOut, pushStatus }) {
  const userId = session.user.id;
  const [agent, setAgent] = useState(null);
  const [settings, setSettings] = useState(null);
  const [requests, setRequests] = useState([]);
  const [active, setActive] = useState(null);
  const [done, setDone] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const lastPos = useRef(null);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [{ data: a }, { data: req }, { data: act }, { data: dn }, { data: st }] = await Promise.all([
      supabase.from('delivery_agents').select('*').eq('id', userId).maybeSingle(),
      supabase.from('orders').select(ORDER_FIELDS).eq('agent_id', userId).eq('agent_state', 'requested'),
      supabase.from('orders').select(ORDER_FIELDS).eq('agent_id', userId).in('agent_state', ['assigned', 'at_shop', 'picked']).limit(1),
      supabase
        .from('orders')
        .select('id, order_no, total, delivery_fee, payment_mode, delivered_at, shops(name)')
        .eq('agent_id', userId)
        .eq('status', 'delivered')
        .gte('delivered_at', start.toISOString())
        .order('delivered_at', { ascending: false }),
      supabase.from('platform_settings').select('rider_share_pct, agent_accept_seconds').eq('id', 1).maybeSingle(),
    ]);
    setAgent(a);
    setRequests(req ?? []);
    setDone(dn ?? []);
    setSettings(st);

    const cur = act?.[0] ?? null;
    if (cur) {
      // Address and customer details become visible once the rider accepts
      const [{ data: addr }, { data: cust }] = await Promise.all([
        supabase.from('addresses').select('line1, landmark, city, pincode, lat, lng').eq('id', cur.address_id).maybeSingle(),
        supabase.from('profiles').select('full_name, phone').eq('id', cur.customer_id).maybeSingle(),
      ]);
      setActive({ ...cur, address: addr, customer: cust });
    } else {
      setActive(null);
    }
  }, [userId]);

  useEffect(() => {
    if (profile.status !== 'active') return;
    load();
    return subscribe(`rider-${userId}`, ['orders', 'delivery_agents'], load);
  }, [load, profile.status]);

  // Share location while online: on movement, plus a heartbeat every minute
  const sendPosition = useCallback(
    async (p) => {
      lastPos.current = p;
      await supabase
        .from('delivery_agents')
        .update({ lat: p.lat, lng: p.lng, location_at: new Date().toISOString() })
        .eq('id', userId);
    },
    [userId],
  );

  useEffect(() => {
    if (!agent?.is_online) return;
    let watcher;
    let stopped = false;
    watchPosition(sendPosition)
      .then((w) => {
        if (stopped) w.remove();
        else watcher = w;
      })
      .catch((e) => Alert.alert('Location needed', errorText(e)));
    const beat = setInterval(() => {
      if (lastPos.current) sendPosition(lastPos.current);
    }, 60000);
    return () => {
      stopped = true;
      watcher?.remove();
      clearInterval(beat);
    };
  }, [agent?.is_online, sendPosition]);

  async function setOnline(on) {
    if (!on && agent?.is_busy) return Alert.alert('Finish your delivery first', 'You can go offline after the current delivery.');
    setToggling(true);
    try {
      const patch = { is_online: on };
      if (on) {
        const p = await currentPosition();
        lastPos.current = p;
        Object.assign(patch, { lat: p.lat, lng: p.lng, location_at: new Date().toISOString() });
      }
      const { error } = await supabase.from('delivery_agents').update(patch).eq('id', userId);
      if (error) throw error;
      await load();
    } catch (e) {
      Alert.alert('Could not change status', errorText(e));
    } finally {
      setToggling(false);
    }
  }

  async function act(order, action, otp) {
    try {
      await rpc('agent_update_order', { p_order_id: order.id, p_action: action, p_otp: otp ?? null });
      await load();
      return true;
    } catch (e) {
      Alert.alert('Could not update', errorText(e));
      return false;
    }
  }

  const refresh = async () => {
    setRefreshing(true);
    await reloadProfile();
    if (profile.status === 'active') await load();
    setRefreshing(false);
  };

  if (profile.status !== 'active') {
    return <Pending profile={profile} what="rider account" onRefresh={refresh} refreshing={refreshing} onSignOut={signOut} />;
  }
  if (!agent) return <Loading />;

  const share = Number(settings?.rider_share_pct ?? 80) / 100;
  const acceptSecs = Number(settings?.agent_accept_seconds ?? 30);

  return (
    <Screen title="LocalKart Rider" subtitle={profile.full_name} refreshing={refreshing} onRefresh={refresh}>
      <PushNotice status={pushStatus} />
      <Card accent={agent.is_online ? C.accent : C.line}>
        <ToggleRow
          label={agent.is_online ? 'You are online' : 'You are offline'}
          sub={agent.is_online ? 'Keep this app open to get requests near you' : 'Go online to get delivery requests'}
          value={agent.is_online}
          onChange={setOnline}
          disabled={toggling}
        />
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Today" value={String(done.length)} />
        <Stat label="Earned" value={rupees(agent.earnings_total)} />
        <Stat label="Cash in hand" value={rupees(agent.cash_in_hand)} tone={Number(agent.cash_in_hand) > 0 ? 'warn' : undefined} />
      </View>
      {Number(agent.cash_in_hand) > 0 ? (
        <Text style={s.small}>Deposit COD cash with the LocalKart team. It is cleared here once recorded.</Text>
      ) : null}

      {requests.map((o) => (
        <RequestCard
          key={o.id}
          o={o}
          me={lastPos.current || (agent.lat ? { lat: agent.lat, lng: agent.lng } : null)}
          earn={Math.round(Number(o.delivery_fee) * share)}
          seconds={acceptSecs}
          onAccept={() => act(o, 'accept')}
          onDecline={() => act(o, 'decline')}
        />
      ))}

      {active ? (
        <ActiveDelivery
          o={active}
          me={lastPos.current || (agent.lat ? { lat: agent.lat, lng: agent.lng } : null)}
          onAction={(a, otp) => act(active, a, otp)}
        />
      ) : null}

      {!requests.length && !active ? (
        <Empty
          text={
            agent.is_online
              ? 'No requests right now. When a shop near you accepts an order, it appears here and your phone rings.'
              : 'You are offline.'
          }
        />
      ) : null}

      {done.length ? <Text style={s.h2}>Completed today</Text> : null}
      {done.map((o) => (
        <Card key={o.id}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.strong}>
              {orderNo(o)} · {o.shops?.name}
            </Text>
            <Text style={s.strong}>+{rupees(Number(o.delivery_fee) * share)}</Text>
          </View>
          <Text style={s.small}>
            {timeText(o.delivered_at)} · {o.payment_mode === 'cod' ? `Collected ${rupees(o.total)} cash` : 'Prepaid'}
          </Text>
        </Card>
      ))}

      <Button title="Log out" kind="ghost" small onPress={signOut} style={{ marginTop: 8 }} />
    </Screen>
  );
}

function RequestCard({ o, me, earn, seconds, onAccept, onDecline }) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const t0 = o.agent_requested_at ? new Date(o.agent_requested_at).getTime() : Date.now();
    const tick = () => setLeft(Math.max(0, Math.round(seconds - (Date.now() - t0) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [o.id, o.agent_requested_at, seconds]);

  const toShop = me && o.shops ? distanceKm(me.lat, me.lng, o.shops.lat, o.shops.lng) : null;
  const run = async (k, fn) => {
    setBusy(k);
    await fn();
    setBusy(null);
  };

  return (
    <Card accent={C.warn}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h2}>New delivery request</Text>
        <Pill text={left > 0 ? `${left}s` : 'Expiring'} tone="warn" />
      </View>
      <Text style={s.strong}>{o.shops?.name}</Text>
      <Text style={s.small}>{o.shops?.address}</Text>
      <Text style={s.small} numberOfLines={2}>{itemsLine(o.order_items)}</Text>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.small}>
          {toShop != null ? `${toShop} km to shop · ` : ''}
          {o.payment_mode === 'cod' ? `Collect ${rupees(o.total)} cash` : 'Prepaid'}
        </Text>
        <Text style={s.strong}>Earn {rupees(earn)}</Text>
      </View>
      <View style={[s.row, { gap: 8 }]}>
        <Button title="Accept" style={{ flex: 1 }} loading={busy === 'a'} onPress={() => run('a', onAccept)} />
        <Button title="Decline" kind="ghost" loading={busy === 'd'} onPress={() => run('d', onDecline)} />
      </View>
    </Card>
  );
}

function ActiveDelivery({ o, me, onAction }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const step = { assigned: 1, at_shop: 2, picked: 3 }[o.agent_state];
  const dest = step === 3 ? o.address : o.shops;

  const run = async (action, code) => {
    setBusy(true);
    const ok = await onAction(action, code);
    setBusy(false);
    if (ok && action === 'delivered') Alert.alert('Delivered', o.payment_mode === 'cod' ? `Collected ${rupees(o.total)}.` : 'Great job!');
  };

  const markers = [
    o.shops && { lat: o.shops.lat, lng: o.shops.lng, label: o.shops.name, color: '#b86e00' },
    o.address && { lat: o.address.lat, lng: o.address.lng, label: 'Customer', color: '#0d7a4e' },
    me && { lat: me.lat, lng: me.lng, label: 'You', color: '#2f6fb5' },
  ].filter(Boolean);

  return (
    <Card accent={C.accent}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h2}>{orderNo(o)}</Text>
        <Pill text={['', 'Go to shop', 'At shop', 'Deliver'][step]} tone="accent" />
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: n <= step ? C.accent : C.line }} />
        ))}
      </View>

      <MapView markers={markers} height={200} />

      {step < 3 ? (
        <View style={{ gap: 2 }}>
          <Text style={s.label}>PICK UP FROM</Text>
          <Text style={s.strong}>{o.shops?.name}</Text>
          <Text style={s.small}>{o.shops?.address}</Text>
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <Text style={s.label}>DELIVER TO</Text>
          <Text style={s.strong}>{o.customer?.full_name || 'Customer'}</Text>
          <Text style={s.small}>
            {o.address?.line1}
            {o.address?.landmark ? `, near ${o.address.landmark}` : ''}, {o.address?.city} {o.address?.pincode}
          </Text>
        </View>
      )}

      <Text style={s.small} numberOfLines={3}>{itemsLine(o.order_items)}</Text>

      <View style={[s.row, { gap: 8 }]}>
        {dest?.lat ? (
          <Button
            small
            kind="soft"
            title="Navigate"
            style={{ flex: 1 }}
            onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=two-wheeler`)}
          />
        ) : null}
        {step < 3 && o.shops?.phone ? (
          <Button small kind="ghost" title="Call shop" onPress={() => Linking.openURL(`tel:${o.shops.phone}`)} />
        ) : null}
        {step === 3 && o.customer?.phone ? (
          <Button small kind="ghost" title="Call customer" onPress={() => Linking.openURL(`tel:${o.customer.phone}`)} />
        ) : null}
      </View>

      {o.payment_mode === 'cod' ? <Banner text={`Collect ${rupees(o.total)} in cash or UPI before handing over.`} /> : null}

      {step === 1 ? <Button title="Reached shop" onPress={() => run('reached_shop')} loading={busy} /> : null}
      {step === 2 ? (
        <>
          {o.status !== 'packed' ? <Text style={s.small}>Waiting for the shop to mark this order packed.</Text> : null}
          <Button title="Picked up" onPress={() => run('picked_up')} loading={busy} disabled={o.status !== 'packed'} />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <Field
            label="Customer's 4-digit OTP"
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="Ask the customer"
            hint="The code is on the customer's order screen."
          />
          <Button title="Confirm delivery" onPress={() => run('delivered', otp)} loading={busy} disabled={otp.length !== 4} />
        </>
      ) : null}
    </Card>
  );
}
