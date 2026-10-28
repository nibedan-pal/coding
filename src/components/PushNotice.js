import React from 'react';
import { Banner } from '../ui';

// Tells the user when they will not get notifications, and why
export default function PushNotice({ status }) {
  if (status === 'denied') {
    return <Banner tone="bad" text="Notifications are off. Turn them on in phone Settings → Apps → LocalKart → Notifications, or you may miss orders." />;
  }
  if (status === 'not-configured') {
    return <Banner text="Test build: push notifications are not set up yet. The screen still updates live while the app is open." />;
  }
  if (status === 'error') {
    return <Banner text="Could not turn on notifications on this phone. Live updates still work while the app is open." />;
  }
  return null;
}
