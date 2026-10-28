// One codebase, three apps. Pick the app with APP_VARIANT=customer|partner|rider.
const fs = require('fs');
const path = require('path');

const VARIANT = process.env.APP_VARIANT || 'customer';

const VARIANTS = {
  customer: { name: 'LocalKart', pkg: 'com.localkart.customer', color: '#0d7a4e' },
  partner: { name: 'LocalKart Partner', pkg: 'com.localkart.partner', color: '#b86e00' },
  rider: { name: 'LocalKart Rider', pkg: 'com.localkart.rider', color: '#2f6fb5' },
};

if (!VARIANTS[VARIANT]) {
  throw new Error(`Unknown APP_VARIANT "${VARIANT}". Use customer, partner or rider.`);
}
const v = VARIANTS[VARIANT];

// Firebase config for push notifications. Without it the app still builds,
// but phones will not receive notifications.
const googleServices = path.join(__dirname, 'google-services.json');
const hasGoogleServices = fs.existsSync(googleServices);

module.exports = () => ({
  name: v.name,
  slug: `localkart-${VARIANT}`,
  scheme: `localkart-${VARIANT}`,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: `./assets/${VARIANT}/icon.png`,
  splash: {
    image: `./assets/${VARIANT}/splash.png`,
    resizeMode: 'contain',
    backgroundColor: v.color,
  },
  android: {
    package: v.pkg,
    versionCode: Number(process.env.BUILD_NUMBER || 1),
    adaptiveIcon: {
      foregroundImage: `./assets/${VARIANT}/adaptive-icon.png`,
      backgroundColor: v.color,
    },
    softwareKeyboardLayoutMode: 'pan',
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
  },
  plugins: [
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: v.color,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          VARIANT === 'rider'
            ? 'LocalKart Rider uses your location to send you nearby deliveries and show customers where their order is.'
            : 'LocalKart uses your location to find shops near you.',
      },
    ],
    [
      'expo-image-picker',
      { photosPermission: 'LocalKart Partner uses your photos to add product images.' },
    ],
  ],
  extra: {
    variant: VARIANT,
    accent: v.color,
    hasPush: hasGoogleServices,
    supabaseUrl: 'https://srbfbgufijupfdxjpxov.supabase.co',
    // Public (anon) key: safe to ship in the app. Row Level Security protects the data.
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYmZiZ3VmaWp1cGZkeGpweG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDI0MDIsImV4cCI6MjEwODc3ODQwMn0.HlNeevTZioqwQsq8hQ0kb9ZDMUktCxEvtztHJub4a4I',
  },
});
