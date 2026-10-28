import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase, errorText } from '../lib/supabase';
import { addressFor, currentPosition } from '../lib/location';
import { Button, C, Card, Field, Screen, s } from '../ui';

export default function AddressScreen({ userId, addresses, first, onDone, onBack }) {
  const [pos, setPos] = useState(null);
  const [form, setForm] = useState({ label: 'Home', line1: '', landmark: '', city: '', pincode: '' });
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function locate() {
    setLocating(true);
    try {
      const p = await currentPosition();
      setPos(p);
      const a = await addressFor(p.lat, p.lng);
      setForm((f) => ({
        ...f,
        line1: f.line1 || [a.line1, a.area].filter(Boolean).join(', '),
        city: f.city || a.city || '',
        pincode: f.pincode || a.pincode || '',
      }));
    } catch (e) {
      Alert.alert('Location needed', errorText(e));
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!pos) return Alert.alert('Location needed', 'Tap "Use my current location" so shops know where to deliver.');
    if (!form.line1.trim() || !form.city.trim() || !/^\d{6}$/.test(form.pincode.trim())) {
      return Alert.alert('Missing details', 'Enter house/street, city and a 6-digit pincode.');
    }
    setSaving(true);
    try {
      await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId);
      const { error } = await supabase.from('addresses').insert({
        user_id: userId,
        label: form.label,
        line1: form.line1.trim(),
        landmark: form.landmark.trim() || null,
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        lat: pos.lat,
        lng: pos.lng,
        is_default: true,
      });
      if (error) throw error;
      onDone();
    } catch (e) {
      Alert.alert('Could not save address', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function choose(a) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId);
    await supabase.from('addresses').update({ is_default: true }).eq('id', a.id);
    onDone();
  }

  return (
    <Screen
      title={first ? 'Where should we deliver?' : 'Delivery address'}
      onBack={onBack}
      footer={<Button title="Save address" onPress={save} loading={saving} />}
    >
      {!first && addresses.length ? (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>SAVED ADDRESSES</Text>
          {addresses.map((a) => (
            <Card key={a.id} onPress={() => choose(a)} accent={a.is_default ? C.accent : undefined}>
              <Text style={s.strong}>{a.label}</Text>
              <Text style={s.small}>
                {a.line1}, {a.city} {a.pincode}
              </Text>
            </Card>
          ))}
          <Text style={[s.label, { marginTop: 8 }]}>ADD A NEW ADDRESS</Text>
        </View>
      ) : null}

      <Button
        title={pos ? `Location set ✓ (tap to update)` : 'Use my current location'}
        kind={pos ? 'soft' : 'primary'}
        onPress={locate}
        loading={locating}
      />
      <View style={s.tabs}>
        {['Home', 'Work', 'Other'].map((l) => (
          <Pressable
            key={l}
            onPress={() => set('label')(l)}
            style={[s.tab, form.label === l && { backgroundColor: C.ink, borderColor: C.ink }]}
          >
            <Text style={[s.tabText, form.label === l && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="House / flat, street, area" value={form.line1} onChangeText={set('line1')} placeholder="Flat 4B, AJ Block, Sector II" />
      <Field label="Landmark (optional)" value={form.landmark} onChangeText={set('landmark')} placeholder="Near City Centre" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field style={{ flex: 1 }} label="City" value={form.city} onChangeText={set('city')} placeholder="Kolkata" />
        <Field
          style={{ flex: 1 }}
          label="Pincode"
          value={form.pincode}
          onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="700091"
        />
      </View>
    </Screen>
  );
}
