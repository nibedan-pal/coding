import React from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Screen, s, C } from '../ui';

export default function Pending({ profile, what = 'account', onRefresh, onSignOut, refreshing, children }) {
  const rejected = profile?.status === 'rejected' || profile?.status === 'suspended';
  return (
    <Screen title="LocalKart" onRefresh={onRefresh} refreshing={refreshing}>
      <Card>
        <Text style={s.h2}>{rejected ? `Your ${what} is not active` : `Your ${what} is being reviewed`}</Text>
        <Text style={s.text}>
          {rejected
            ? 'Please contact LocalKart support to know more.'
            : 'The LocalKart team checks every new partner. You will be able to start as soon as it is approved. Pull down to check again.'}
        </Text>
        <View style={{ gap: 2 }}>
          <Text style={s.small}>Name: {profile?.full_name || '—'}</Text>
          <Text style={s.small}>Email: {profile?.email || '—'}</Text>
          <Text style={s.small}>Phone: {profile?.phone || '—'}</Text>
        </View>
      </Card>
      {children}
      <Button title="Check again" kind="soft" onPress={onRefresh} loading={refreshing} />
      <Button title="Log out" kind="ghost" onPress={onSignOut} />
      <Text style={[s.small, { textAlign: 'center', color: C.muted }]}>Status: {profile?.status}</Text>
    </Screen>
  );
}
