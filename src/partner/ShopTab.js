import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { supabase, errorText } from '../lib/supabase';
import { rupees } from '../lib/format';
import { Button, Card, Field, Stat, ToggleRow, s } from '../ui';

export default function ShopTab({ shop, onChanged, signOut, tick }) {
  const [stats, setStats] = useState(null);
  const [radius, setRadius] = useState(String(shop.delivery_radius_km));
  const [prep, setPrep] = useState(String(shop.prep_minutes));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from('orders')
        .select('items_total, commission_amount, placed_at')
        .eq('shop_id', shop.id)
        .eq('status', 'delivered')
        .gte('placed_at', weekAgo);
      const all = data ?? [];
      const today = all.filter((o) => new Date(o.placed_at) >= start);
      const sum = (l, k) => l.reduce((n, o) => n + Number(o[k]), 0);
      setStats({
        todayCount: today.length,
        todaySales: sum(today, 'items_total'),
        weekSales: sum(all, 'items_total'),
        weekCommission: sum(all, 'commission_amount'),
      });
    })();
  }, [shop.id, tick]);

  async function update(values, okText) {
    setSaving(true);
    try {
      const { error } = await supabase.from('shops').update(values).eq('id', shop.id);
      if (error) throw error;
      await onChanged();
      if (okText) Alert.alert('Saved', okText);
    } catch (e) {
      Alert.alert('Could not save', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function saveSettings() {
    const r = Number(radius);
    const p = parseInt(prep, 10);
    if (!(r >= 0.5 && r <= 10)) return Alert.alert('Delivery area', 'Radius must be between 0.5 and 10 km.');
    if (!(p >= 2 && p <= 60)) return Alert.alert('Packing time', 'Packing time must be between 2 and 60 minutes.');
    update({ delivery_radius_km: r, prep_minutes: p }, 'Shop settings updated.');
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <ToggleRow
          label={shop.is_open ? 'Shop is open' : 'Shop is closed'}
          sub={shop.is_open ? 'Customers can order now' : 'Customers can see you but cannot order'}
          value={shop.is_open}
          onChange={(v) => update({ is_open: v })}
          disabled={saving}
        />
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Today orders" value={stats ? String(stats.todayCount) : '–'} />
        <Stat label="Today sales" value={stats ? rupees(stats.todaySales) : '–'} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="7-day sales" value={stats ? rupees(stats.weekSales) : '–'} />
        <Stat label="7-day payout" value={stats ? rupees(stats.weekSales - stats.weekCommission) : '–'} />
      </View>
      <Text style={s.small}>
        Payout = delivered sales minus LocalKart commission ({stats ? rupees(stats.weekCommission) : '–'} this week). Paid to your bank weekly.
      </Text>

      <Card>
        <Text style={s.h2}>Delivery settings</Text>
        <Field label="Delivery radius (km)" value={radius} onChangeText={setRadius} keyboardType="decimal-pad" />
        <Field label="Average packing time (minutes)" value={prep} onChangeText={setPrep} keyboardType="number-pad" hint="Used to show customers an arrival time." />
        <Button title="Save settings" kind="soft" onPress={saveSettings} loading={saving} />
      </Card>

      <Card>
        <Text style={s.label}>SHOP DETAILS</Text>
        <Text style={s.text}>{shop.address}, {shop.city} {shop.pincode}</Text>
        <Text style={s.small}>Status: {shop.status}{shop.phone ? ` · ${shop.phone}` : ''}</Text>
        {shop.gstin ? <Text style={s.small}>GSTIN {shop.gstin}</Text> : null}
      </Card>

      <Button title="Log out" kind="ghost" onPress={signOut} />
    </View>
  );
}
