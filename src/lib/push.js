import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase, VARIANT, HAS_PUSH } from './supabase';

// Show notifications even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android channels. Server messages pick one by channel_id.
// "orders" is loud (new orders, delivery requests); "updates" is normal.
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: VARIANT === 'rider' ? 'Delivery requests' : 'New orders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync('updates', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

let currentToken = null;

// Ask permission, get this phone's Firebase token, and save it for the server.
// Returns a short status the UI can show.
export async function registerForPush(userId) {
  if (!HAS_PUSH) return 'not-configured';
  if (!Device.isDevice) return 'emulator';

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';

  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    currentToken = token;
    await supabase.from('push_tokens').upsert({
      token,
      user_id: userId,
      app: VARIANT,
      updated_at: new Date().toISOString(),
    });
    return 'ok';
  } catch (e) {
    console.warn('Push registration failed', e);
    return 'error';
  }
}

// Remove this phone's token on logout so the next user does not get alerts
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}
