import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { rupees } from '../lib/format';
import { C } from '../ui';

export default function CartBar({ cart, cartApi, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: C.accent,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      accessibilityRole="button"
    >
      <View>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
          {cartApi.count} item{cartApi.count > 1 ? 's' : ''} · {rupees(cartApi.total)}
        </Text>
        <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>from {cart.shop?.name}</Text>
      </View>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>View cart ›</Text>
    </Pressable>
  );
}
