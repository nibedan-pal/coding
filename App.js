import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase, VARIANT, ROLE_FOR_VARIANT } from './src/lib/supabase';
import { registerForPush, setupNotificationChannels, unregisterPush } from './src/lib/push';
import AuthScreen from './src/components/AuthScreen';
import { Button, Loading, Screen, s } from './src/ui';
import CustomerApp from './src/customer/CustomerApp';
import PartnerApp from './src/partner/PartnerApp';
import RiderApp from './src/rider/RiderApp';

const APPS = { customer: CustomerApp, partner: PartnerApp, rider: RiderApp };
const APP_LABEL = { customer: 'customer', vendor: 'shop partner', agent: 'rider', admin: 'admin' };

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);

  useEffect(() => {
    setupNotificationChannels().catch(() => {});
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) return setProfile(null);
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    setProfile(data ?? { missing: true });
  }, [session?.user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (session?.user?.id) registerForPush(session.user.id).then(setPushStatus);
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  if (session === undefined) return <Loading />;
  if (!session) return <AuthScreen />;
  if (!profile) return <Loading />;

  if (profile.missing) {
    return (
      <Screen title="LocalKart">
        <Text style={s.text}>Your profile could not be loaded. Check your internet and try again.</Text>
        <Button title="Try again" onPress={loadProfile} />
        <Button title="Log out" kind="ghost" onPress={signOut} />
      </Screen>
    );
  }

  const expected = ROLE_FOR_VARIANT[VARIANT];
  if (profile.role !== expected) {
    return (
      <Screen title="Wrong app">
        <Text style={s.text}>
          This is a {APP_LABEL[profile.role] || profile.role} account. Please use the LocalKart{' '}
          {VARIANT === 'customer' ? '' : VARIANT === 'partner' ? 'Partner ' : 'Rider '}app with a{' '}
          {APP_LABEL[expected]} account, or create a new one.
        </Text>
        <Button title="Log out" onPress={signOut} />
      </Screen>
    );
  }

  const AppForVariant = APPS[VARIANT];
  return (
    <View style={{ flex: 1 }}>
      <AppForVariant
        session={session}
        profile={profile}
        reloadProfile={loadProfile}
        signOut={signOut}
        pushStatus={pushStatus}
      />
    </View>
  );
}
