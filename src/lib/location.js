import * as Location from 'expo-location';

// Get the phone's current position. Throws a readable error if not allowed.
export async function currentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is off. Allow location for this app in phone Settings.');
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Best-effort address from coordinates (uses the phone's built-in geocoder)
export async function addressFor(lat, lng) {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!a) return {};
    return {
      line1: [a.name, a.street].filter(Boolean).join(', '),
      area: a.district || a.subregion || '',
      city: a.city || a.subregion || '',
      pincode: a.postalCode || '',
    };
  } catch {
    return {};
  }
}

export async function watchPosition(onPosition) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is off. Allow location for this app in phone Settings.');
  }
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 25 },
    (pos) => onPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
  );
}
