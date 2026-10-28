// LocalKart push notifications
// Called by the order_push_notify database trigger whenever an order is
// created or moves to a new stage. Sends Firebase Cloud Messaging (FCM v1)
// notifications to the shop owner, the rider and the customer.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FIREBASE_SERVICE_ACCOUNT   full JSON of the Firebase service account key
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Msg = {
  userId: string;
  app: "customer" | "partner" | "rider";
  title: string;
  body: string;
  channel: "orders" | "updates";
};

// ---------- Firebase auth (OAuth token from the service account) ----------
let cachedToken: { value: string; exp: number } | null = null;

async function firebaseAccess(): Promise<{ token: string; projectId: string } | null> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) return null;
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) {
    return { token: cachedToken.value, projectId: sa.project_id };
  }
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Firebase auth failed: " + JSON.stringify(json));
  cachedToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return { token: cachedToken.value, projectId: sa.project_id };
}

async function sendToUser(fb: { token: string; projectId: string }, m: Msg, orderId: string) {
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", m.userId)
    .eq("app", m.app);

  for (const t of tokens ?? []) {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${fb.projectId}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${fb.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: m.title, body: m.body },
            data: { order_id: orderId },
            android: {
              priority: "high",
              notification: { channel_id: m.channel, sound: "default" },
            },
          },
        }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      // Remove tokens for uninstalled apps
      if (res.status === 404 || err.includes("UNREGISTERED")) {
        await supabase.from("push_tokens").delete().eq("token", t.token);
      } else {
        console.error("FCM send failed", res.status, err);
      }
    }
  }
}

// ---------- Which notifications an order change produces ----------
function rupees(n: number) {
  return "₹" + Math.round(Number(n)).toLocaleString("en-IN");
}

function buildMessages(ev: any, o: any): Msg[] {
  const no = "LK" + o.order_no;
  const shop = o.shops?.name ?? "the shop";
  const owner = o.shops?.owner_id;
  const out: Msg[] = [];
  const statusChanged = ev.type === "INSERT" || ev.old_status !== o.status;
  const agentChanged = ev.old_agent_state !== o.agent_state || ev.old_agent_id !== o.agent_id;

  if (statusChanged) {
    switch (o.status) {
      case "placed":
        if (owner) out.push({
          userId: owner, app: "partner", channel: "orders",
          title: `New order ${no}`,
          body: `${rupees(o.items_total)} · ${o.payment_mode === "cod" ? "Cash on delivery" : "Paid online"}. Accept within 2 minutes.`,
        });
        break;
      case "accepted":
        out.push({ userId: o.customer_id, app: "customer", channel: "updates",
          title: "Order accepted", body: `${shop} is packing your order ${no}.` });
        break;
      case "rejected":
        out.push({ userId: o.customer_id, app: "customer", channel: "updates",
          title: "Order could not be accepted",
          body: `${shop} could not take ${no}.${o.payment_mode === "online" ? " Your refund has started." : ""}` });
        break;
      case "packed":
        out.push({ userId: o.customer_id, app: "customer", channel: "updates",
          title: "Order packed", body: `${no} is packed and waiting for the rider.` });
        if (o.agent_id && ["assigned", "at_shop"].includes(o.agent_state)) {
          out.push({ userId: o.agent_id, app: "rider", channel: "orders",
            title: `${no} is ready`, body: `Pick it up from ${shop}.` });
        }
        break;
      case "picked_up":
        out.push({ userId: o.customer_id, app: "customer", channel: "updates",
          title: "On the way", body: `Your order ${no} is out for delivery. Keep your OTP ready.` });
        break;
      case "delivered":
        out.push({ userId: o.customer_id, app: "customer", channel: "updates",
          title: "Delivered", body: `${no} has been delivered. Rate your order in the app.` });
        if (owner) out.push({ userId: owner, app: "partner", channel: "updates",
          title: `${no} delivered`, body: `${rupees(o.items_total)} added to your sales.` });
        break;
      case "cancelled":
        if (owner) out.push({ userId: owner, app: "partner", channel: "updates",
          title: `${no} cancelled`, body: "The customer cancelled this order." });
        break;
    }
  }

  if (agentChanged && o.agent_id) {
    if (o.agent_state === "requested") {
      out.push({ userId: o.agent_id, app: "rider", channel: "orders",
        title: "New delivery request",
        body: `${shop} · ${o.payment_mode === "cod" ? "Collect " + rupees(o.total) + " cash" : "Prepaid"}. Respond within 30 seconds.` });
    }
    if (o.agent_state === "assigned") {
      out.push({ userId: o.customer_id, app: "customer", channel: "updates",
        title: "Rider assigned", body: `A delivery partner is heading to ${shop} for ${no}.` });
    }
  }
  return out;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  try {
    const { data: secretRow } = await supabase
      .from("app_config").select("value").eq("key", "webhook_secret").single();
    if (!secretRow || req.headers.get("x-webhook-secret") !== secretRow.value) {
      return new Response("Forbidden", { status: 403 });
    }

    const ev = await req.json();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_no, status, agent_state, agent_id, customer_id, items_total, total, payment_mode, shops(name, owner_id)")
      .eq("id", ev.order_id)
      .single();
    if (error || !order) return new Response("Order not found", { status: 200 });

    const messages = buildMessages(ev, order);
    if (!messages.length) return new Response("No notification needed", { status: 200 });

    const fb = await firebaseAccess();
    if (!fb) {
      console.warn("FIREBASE_SERVICE_ACCOUNT not set; skipped", messages.length, "notifications");
      return new Response("Firebase not configured yet", { status: 200 });
    }

    await Promise.all(messages.map((m) => sendToUser(fb, m, order.id)));
    return new Response(JSON.stringify({ sent: messages.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("Error: " + (e as Error).message, { status: 500 });
  }
});
