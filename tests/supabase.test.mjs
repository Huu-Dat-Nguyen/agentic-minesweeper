import test from "node:test";
import assert from "node:assert/strict";
import { createSupabase } from "../data/supabase.mjs";

const URL_ = "https://example.supabase.co";
const KEY = "public-key";
const NOW = () => Math.floor(Date.now() / 1000);
const SESSION = { access_token: "tok", refresh_token: "ref", expires_at: NOW() + 3600, user: { id: "u1", email: "a@b.c" } };
const TOKEN_BODY = { access_token: "new", refresh_token: "ref2", expires_in: 3600, user: { id: "u1" } };

// Records requests; `replies` is a list of [status, body] or an Error, used in order.
function setup({ session = null, replies = [] } = {}) {
  const calls = [];
  const saved = [];
  const queue = [...replies];
  const fetch = async (url, init) => {
    calls.push({ url: url.replace(URL_, ""), ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const reply = queue.shift() ?? [200, null];
    if (reply instanceof Error) throw reply;
    return new Response(reply[1] === null ? null : JSON.stringify(reply[1]), { status: reply[0] });
  };
  const api = createSupabase({ url: URL_, key: KEY, fetch, session: { load: () => session, save: (value) => saved.push(value) } });
  return { api, calls, saved };
}

test("requests send the key, and a bearer token only when signed in", async () => {
  const out = setup({ replies: [[200, []]] });
  await out.api.usernameTaken("bob");
  assert.equal(out.calls[0].headers.apikey, KEY);
  assert.equal("Authorization" in out.calls[0].headers, false);

  const signedIn = setup({ session: SESSION, replies: [[200, []]] });
  await signedIn.api.usernameTaken("bob");
  assert.equal(signedIn.calls[0].headers.Authorization, "Bearer tok");
});

test("sign-up without a session needs email confirmation", async () => {
  const out = setup({ replies: [[200, { id: "u1", email: "a@b.c" }]] });
  const result = await out.api.signUp("a@b.c", "secret12", "bob");
  assert.deepEqual(result, { user: { id: "u1", email: "a@b.c" }, signedIn: false });
  assert.deepEqual(out.calls[0].body, { email: "a@b.c", password: "secret12", data: { username: "bob" } });
  assert.equal(out.calls[0].url, "/auth/v1/signup");
  assert.equal(out.api.user(), null);
  assert.deepEqual(out.saved, []);
});

test("sign-up with a session signs in; sign-in stores the session", async () => {
  const up = setup({ replies: [[200, TOKEN_BODY]] });
  assert.equal((await up.api.signUp("a@b.c", "secret12", "bob")).signedIn, true);
  assert.equal(up.api.user().id, "u1");

  const inn = setup({ replies: [[200, TOKEN_BODY]] });
  await inn.api.signIn("a@b.c", "secret12");
  assert.equal(inn.calls[0].url, "/auth/v1/token?grant_type=password");
  assert.equal(inn.saved[0].access_token, "new");
  assert.ok(inn.saved[0].expires_at > NOW() + 3000);
});

test("an expiring session is refreshed before the request", async () => {
  const old = { ...SESSION, expires_at: NOW() + 10 };
  const out = setup({ session: old, replies: [[200, TOKEN_BODY], [200, []]] });
  await out.api.usernameTaken("bob");
  assert.equal(out.calls[0].url, "/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(out.calls[0].body, { refresh_token: "ref" });
  assert.equal(out.calls[1].headers.Authorization, "Bearer new");
  assert.equal(out.saved.at(-1).refresh_token, "ref2");
});

test("a failed refresh clears the session and throws", async () => {
  const old = { ...SESSION, expires_at: NOW() - 5 };
  const out = setup({ session: old, replies: [[400, { error_description: "Token expired" }]] });
  await assert.rejects(out.api.usernameTaken("bob"), /Token expired/);
  assert.equal(out.api.user(), null);
  assert.equal(out.saved.at(-1), null);
});

test("errors carry the server's message or the status", async () => {
  const out = setup({ replies: [[422, { msg: "User already registered" }], [400, { message: "bad row" }], [500, null]] });
  await assert.rejects(out.api.signUp("a@b.c", "x", "bob"), /User already registered/);
  await assert.rejects(out.api.usernameTaken("bob"), /bad row/);
  await assert.rejects(out.api.usernameTaken("bob"), /Request failed \(500\)/);
});

test("usernameTaken encodes the name and reads the answer", async () => {
  const out = setup({ replies: [[200, [{ id: "x" }]], [200, []]] });
  assert.equal(await out.api.usernameTaken("a&b=c"), true);
  assert.equal(out.calls[0].url, "/rest/v1/profiles?select=id&username=eq.a%26b%3Dc");
  assert.equal(await out.api.usernameTaken("free"), false);
});

test("topTimes posts its arguments and works signed out", async () => {
  const out = setup({ replies: [[200, [{ username: "bob", seconds: 30 }]]] });
  assert.deepEqual(await out.api.topTimes("daily", "2026-10-26"), [{ username: "bob", seconds: 30 }]);
  assert.equal(out.calls[0].url, "/rest/v1/rpc/top_times");
  assert.deepEqual(out.calls[0].body, { p_mode: "daily", p_date: "2026-10-26", p_limit: 20 });
});

test("signOut clears the session even when the request fails", async () => {
  const out = setup({ session: SESSION, replies: [new Error("offline")] });
  await out.api.signOut();
  assert.equal(out.calls[0].url, "/auth/v1/logout");
  assert.equal(out.api.user(), null);
  assert.equal(out.saved.at(-1), null);
});

test("own-data calls use the user's id and ask to return nothing", async () => {
  const out = setup({ session: SESSION, replies: [[200, [{ username: "bob", stats_reset_at: null }]], [204, null], [201, null]] });
  assert.equal((await out.api.profile()).username, "bob");
  assert.equal(out.calls[0].url, "/rest/v1/profiles?select=username,stats_reset_at&id=eq.u1");
  const at = await out.api.resetStats();
  assert.equal(out.calls[1].method, "PATCH");
  assert.deepEqual(out.calls[1].body, { stats_reset_at: at });
  assert.equal(out.calls[1].headers.Prefer, "return=minimal");
  await out.api.saveGame({ mode: "beginner" });
  assert.equal(out.calls[2].url, "/rest/v1/games");
  assert.equal(out.calls[2].headers.Prefer, "return=minimal");
});

test("games reads every page", async () => {
  const page = Array.from({ length: 1000 }, (_, i) => ({ seconds: i }));
  const out = setup({ session: SESSION, replies: [[200, page], [200, [{ seconds: 1 }]]] });
  assert.equal((await out.api.games()).length, 1001);
  assert.match(out.calls[1].url, /offset=1000/);
});

test("signed-out own-data calls fail clearly", async () => {
  await assert.rejects(setup().api.profile(), /Sign in first/);
});
