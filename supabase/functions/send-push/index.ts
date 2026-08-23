import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type PushRequest = {
  title: string;
  body: string;
  deviceIds?: string[];
  tokens?: string[];
  data?: Record<string, string>;
};

type PushDevice = { token: string; device_id: string | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const base64Url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function firebaseAccessToken(serviceAccount: FirebaseServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const pem = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  ));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${await response.text()}`);
  return (await response.json()).access_token as string;
}

serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("x-push-admin-key") !== Deno.env.get("PUSH_ADMIN_KEY")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: PushRequest;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!payload.title?.trim() || !payload.body?.trim()) {
    return json({ error: "title and body are required" }, 400);
  }

  const serviceAccountText = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountText) return json({ error: "Firebase is not configured" }, 500);
  const serviceAccount = JSON.parse(serviceAccountText) as FirebaseServiceAccount;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase server credentials unavailable" }, 500);

  const params = new URLSearchParams({ select: "token,device_id", platform: "eq.android" });
  if (payload.tokens?.length) params.set("token", `in.(${payload.tokens.map((token) => `\"${token}\"`).join(",")})`);
  if (payload.deviceIds?.length) params.set("device_id", `in.(${payload.deviceIds.map((id) => `\"${id}\"`).join(",")})`);
  const devicesResponse = await fetch(`${supabaseUrl}/rest/v1/push_devices?${params}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!devicesResponse.ok) return json({ error: "Could not load device tokens" }, 500);
  const devices = await devicesResponse.json() as PushDevice[];
  const accessToken = await firebaseAccessToken(serviceAccount);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
  const results = await Promise.all(devices.map(async ({ token }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: { priority: "high", notification: { channel_id: "petko" } },
        },
      }),
    });
    return { token, ok: response.ok, detail: response.ok ? null : await response.text() };
  }));
  const failed = results.filter((result) => !result.ok);
  return json({ targeted: devices.length, delivered: results.length - failed.length, failed: failed.length });
});
