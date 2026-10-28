import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { supabase, VARIANT, ROLE_FOR_VARIANT, errorText } from '../lib/supabase';
import { Button, C, Field, Screen, s } from '../ui';

const COPY = {
  customer: {
    title: 'LocalKart',
    tagline: 'Groceries, sweets and medicines from shops near you, in minutes.',
  },
  partner: {
    title: 'LocalKart Partner',
    tagline: 'Sell to customers in your area. Get orders on your phone.',
  },
  rider: {
    title: 'LocalKart Rider',
    tagline: 'Deliver orders near you and earn on every trip.',
  },
};

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('bike');
  const [busy, setBusy] = useState(false);
  const copy = COPY[VARIANT];

  async function submit() {
    const e = email.trim().toLowerCase();
    if (!e || !password) return Alert.alert('Missing details', 'Enter your email and password.');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
      } else {
        if (!name.trim()) throw new Error('Enter your name.');
        if (!/^\d{10}$/.test(phone.trim())) throw new Error('Enter a 10-digit mobile number.');
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password,
          options: {
            data: {
              role: ROLE_FOR_VARIANT[VARIANT],
              full_name: name.trim(),
              phone: '+91' + phone.trim(),
              vehicle_type: VARIANT === 'rider' ? vehicle : undefined,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Check your email', `We sent a confirmation link to ${e}. Open it, then log in here.`);
          setMode('login');
        }
      }
    } catch (err) {
      Alert.alert(mode === 'login' ? 'Could not log in' : 'Could not sign up', errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ paddingTop: 40, paddingBottom: 12, gap: 8 }}>
          <Text style={{ fontSize: 34, fontWeight: '800', color: C.accent }}>{copy.title}</Text>
          <Text style={[s.text, { color: C.muted, fontSize: 16 }]}>{copy.tagline}</Text>
        </View>

        <View style={[s.tabs, { marginBottom: 4 }]}>
          {['login', 'signup'].map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[s.tab, mode === m && { backgroundColor: C.ink, borderColor: C.ink }]}
            >
              <Text style={[s.tabText, mode === m && { color: '#fff' }]}>
                {m === 'login' ? 'Log in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'signup' ? (
          <>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Ananya Das" autoComplete="name" />
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="98XXXXXXXX"
              keyboardType="phone-pad"
              hint="10 digits, without +91"
            />
          </>
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
          secureTextEntry
          autoCapitalize="none"
        />

        {mode === 'signup' && VARIANT === 'rider' ? (
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Vehicle</Text>
            <View style={s.tabs}>
              {['bike', 'scooter', 'cycle'].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVehicle(v)}
                  style={[s.tab, vehicle === v && { backgroundColor: C.accent, borderColor: C.accent }]}
                >
                  <Text style={[s.tabText, vehicle === v && { color: '#fff' }]}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {mode === 'signup' && VARIANT !== 'customer' ? (
          <Text style={s.small}>
            New {VARIANT === 'partner' ? 'shop' : 'rider'} accounts are checked by the LocalKart team before you can
            start. This usually takes a day.
          </Text>
        ) : null}

        <Button title={mode === 'login' ? 'Log in' : 'Create account'} onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
