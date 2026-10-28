import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase, errorText } from '../lib/supabase';
import { addressFor, currentPosition } from '../lib/location';
import { Button, C, Field, Screen, s } from '../ui';

export default function ShopSetup({ userId, onCreated, signOut }) {
  const [cats, setCats] = useState([]);
  const [pos, setPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    name: '',
    category_id: null,
    phone: '',
    address: '',
    city: '',
    pincode: '',
    radius: '3',
    gstin: '',
    fssai: '',
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase.from('categories').select('id,name').order('sort').then(({ data }) => setCats(data ?? []));
  }, []);

  async function locate() {
    setLocating(true);
    try {
      const p = await currentPosition();
      setPos(p);
      const a = await addressFor(p.lat, p.lng);
      setF((x) => ({
        ...x,
        address: x.address || [a.line1, a.area].filter(Boolean).join(', '),
        city: x.city || a.city || '',
        pincode: x.pincode || a.pincode || '',
      }));
    } catch (e) {
      Alert.alert('Location needed', errorText(e));
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const radius = Number(f.radius);
    if (!f.name.trim()) return Alert.alert('Missing details', 'Enter your shop name.');
    if (!f.category_id) return Alert.alert('Missing details', 'Choose what your shop sells.');
    if (!pos) return Alert.alert('Location needed', 'Stand inside your shop and tap "Use shop location".');
    if (!f.address.trim() || !f.city.trim() || !/^\d{6}$/.test(f.pincode)) {
      return Alert.alert('Missing details', 'Enter the shop address, city and 6-digit pincode.');
    }
    if (!(radius >= 0.5 && radius <= 10)) return Alert.alert('Delivery area', 'Delivery radius must be between 0.5 and 10 km.');
    setSaving(true);
    try {
      const { error } = await supabase.from('shops').insert({
        owner_id: userId,
        name: f.name.trim(),
        category_id: f.category_id,
        phone: f.phone ? '+91' + f.phone : null,
        address: f.address.trim(),
        city: f.city.trim(),
        pincode: f.pincode,
        lat: pos.lat,
        lng: pos.lng,
        delivery_radius_km: radius,
        gstin: f.gstin.trim() || null,
        fssai_no: f.fssai.trim() || null,
      });
      if (error) throw error;
      onCreated();
    } catch (e) {
      Alert.alert('Could not create shop', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Set up your shop"
      subtitle="Takes about 2 minutes"
      footer={<Button title="Create shop" onPress={save} loading={saving} />}
    >
      <Field label="Shop name" value={f.name} onChangeText={set('name')} placeholder="Das Fresh Mart" />
      <View style={{ gap: 6 }}>
        <Text style={s.label}>What do you sell?</Text>
        <View style={s.tabs}>
          {cats.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => set('category_id')(c.id)}
              style={[s.tab, f.category_id === c.id && { backgroundColor: C.accent, borderColor: C.accent }]}
            >
              <Text style={[s.tabText, f.category_id === c.id && { color: '#fff' }]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Button
        title={pos ? 'Shop location set ✓ (tap to update)' : 'Use shop location'}
        kind={pos ? 'soft' : 'primary'}
        onPress={locate}
        loading={locating}
      />
      <Text style={s.small}>Do this while standing in your shop. Customers nearby will see you based on this point.</Text>
      <Field label="Shop address" value={f.address} onChangeText={set('address')} placeholder="12, Market Road, Sector V" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field style={{ flex: 1 }} label="City" value={f.city} onChangeText={set('city')} placeholder="Kolkata" />
        <Field
          style={{ flex: 1 }}
          label="Pincode"
          value={f.pincode}
          onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="700091"
        />
      </View>
      <Field
        label="Shop phone (optional)"
        value={f.phone}
        onChangeText={(t) => set('phone')(t.replace(/\D/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        placeholder="98XXXXXXXX"
      />
      <Field
        label="Delivery radius (km)"
        value={f.radius}
        onChangeText={set('radius')}
        keyboardType="decimal-pad"
        hint="Customers within this distance can order. 2–4 km keeps delivery fast."
      />
      <Field label="GSTIN (optional)" value={f.gstin} onChangeText={set('gstin')} autoCapitalize="characters" />
      <Field label="FSSAI licence no. (food shops)" value={f.fssai} onChangeText={set('fssai')} keyboardType="number-pad" />
      <Button title="Log out" kind="ghost" small onPress={signOut} />
    </Screen>
  );
}
