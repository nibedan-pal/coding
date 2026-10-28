# LocalKart apps

Three Android apps from one React Native (Expo SDK 52) codebase, all connected to the
LocalKart Supabase project.

| App | Package | For |
| --- | --- | --- |
| LocalKart | `com.localkart.customer` | Customers: find nearby shops, order, track, pay cash on delivery |
| LocalKart Partner | `com.localkart.partner` | Shop owners: set up shop, add products with photos, accept and pack orders |
| LocalKart Rider | `com.localkart.rider` | Riders: go online, accept requests, deliver with OTP, track cash and earnings |

The app is chosen at build time with `APP_VARIANT=customer|partner|rider`.

## Get the APKs

Every push to `main` runs **Actions → Build APKs**. After about 15–20 minutes, open
**Releases** on the repo page from your phone and download the three `.apk` files.
You can also run it by hand: **Actions → Build APKs → Run workflow**.

## Turn on push notifications

1. In the Firebase console, create a project and add three Android apps with the
   package names above.
2. Download `google-services.json` (after adding all three apps) and commit it to the
   repo root. It is safe to commit; it only identifies the project.
3. Firebase → Project settings → Service accounts → **Generate new private key**.
   Copy the whole JSON into Supabase → Edge Functions → Secrets as
   `FIREBASE_SERVICE_ACCOUNT`. **Never commit this file.**
4. Push to `main` so new APKs are built with Firebase included.

Who gets notified:

| Event | Who | Channel |
| --- | --- | --- |
| New order placed | Shop owner | Loud (`orders`) |
| Delivery request | Rider | Loud (`orders`) |
| Order packed, rider already assigned | Rider | Loud (`orders`) |
| Accepted, rejected, packed, rider assigned, picked up, delivered | Customer | Normal (`updates`) |
| Delivered, cancelled by customer | Shop owner | Normal (`updates`) |

Notifications are sent by the `send-push` Supabase Edge Function, called by the
`order_push_notify` database trigger.

## Testing flow

1. **Supabase → Authentication → Sign In / Providers → Email**: turn off
   "Confirm email" while testing, so new accounts can log in straight away.
2. Install all three APKs.
3. **Partner app**: create an account, set up the shop while standing at the shop
   location, add a few products.
4. **Rider app**: create an account.
5. Approve both. Until the admin website exists, run this in the Supabase SQL editor:
   ```sql
   update public.profiles set status = 'active' where role in ('vendor', 'agent');
   update public.shops set status = 'approved';
   ```
6. **Rider app**: go online (keep the app open).
7. **Customer app**: create an account, save an address within the shop's delivery
   radius, order, and watch the shop, rider and customer screens update live.

## Run locally (optional)

```bash
npm install
npx expo install --fix
APP_VARIANT=partner npx expo run:android
```

## Project layout

```
App.js                 login, role check, picks the app for this build
app.config.js          names, packages, icons and Supabase keys per app
src/lib/               Supabase client, push, location, formatting
src/ui.js              shared components and colours
src/customer/          customer screens
src/partner/           shop owner screens
src/rider/             rider screens
supabase/functions/    send-push Edge Function (FCM)
supabase/migrations/   database setup (already applied to the live project)
.github/workflows/     APK build pipeline
```

## Known limits in this first build

- Online payment is shown as "coming soon"; orders use cash on delivery.
- The rider app shares location only while it is open. Background location comes later.
- APKs are signed with a test key. Make a proper release key before the Play Store.
