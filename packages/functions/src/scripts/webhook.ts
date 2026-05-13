import { Resource } from "sst";

const CALLBACK = "https://run.rfoel.dev/api/strava/webhook";

function clientCreds() {
  return {
    client_id: Resource.StravaClientId.value,
    client_secret: Resource.StravaClientSecret.value,
  };
}

async function list() {
  const { client_id, client_secret } = clientCreds();
  const url = `https://www.strava.com/api/v3/push_subscriptions?client_id=${client_id}&client_secret=${client_secret}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function register() {
  const { client_id, client_secret } = clientCreds();
  const form = new FormData();
  form.append("client_id", client_id);
  form.append("client_secret", client_secret);
  form.append("callback_url", CALLBACK);
  form.append("verify_token", Resource.StravaVerifyToken.value);

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  console.log(`status ${res.status}`);
  console.log(JSON.stringify(data, null, 2));
}

async function remove() {
  const { client_id, client_secret } = clientCreds();
  // Find existing
  const listRes = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${client_id}&client_secret=${client_secret}`,
  );
  const subs = (await listRes.json()) as Array<{ id: number }>;
  if (subs.length === 0) {
    console.log("no subscriptions");
    return;
  }
  for (const s of subs) {
    const url = `https://www.strava.com/api/v3/push_subscriptions/${s.id}?client_id=${client_id}&client_secret=${client_secret}`;
    const res = await fetch(url, { method: "DELETE" });
    console.log(`deleted ${s.id}: ${res.status}`);
  }
}

function oauthUrl() {
  const { client_id } = clientCreds();
  const redirect = "https://run.rfoel.dev/api/strava/oauth/callback";
  const scope = "read,activity:read_all";
  const url = `https://www.strava.com/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${scope}&approval_prompt=force`;
  console.log(url);
}

const cmd = process.argv[2];
const fns: Record<string, () => Promise<void> | void> = {
  list,
  register,
  remove,
  reset: async () => {
    await remove();
    await register();
  },
  oauth: oauthUrl,
};

const fn = cmd ? fns[cmd] : undefined;
if (!fn) {
  console.error(`usage: webhook <list|register|remove|reset|oauth>`);
  process.exit(1);
}

Promise.resolve(fn()).catch((e) => {
  console.error(e);
  process.exit(1);
});
