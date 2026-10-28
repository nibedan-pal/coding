import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};

export const VARIANT = extra.variant ?? 'customer';
export const ACCENT = extra.accent ?? '#0d7a4e';
export const HAS_PUSH = !!extra.hasPush;

// Which profile role each app is for
export const ROLE_FOR_VARIANT = { customer: 'customer', partner: 'vendor', rider: 'agent' };

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the login token only while the app is in the foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function errorText(error) {
  if (!error) return 'Something went wrong. Please try again.';
  const msg = error.message || String(error);
  if (/Network request failed|Failed to fetch/i.test(msg)) {
    return 'No internet connection. Check your network and try again.';
  }
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is wrong.';
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first, then log in.';
  return msg;
}

// Run a database function and throw a readable error if it fails
export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(errorText(error));
  return data;
}

// Subscribe to live changes on tables. Returns an unsubscribe function.
export function subscribe(channelName, tables, onChange) {
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
