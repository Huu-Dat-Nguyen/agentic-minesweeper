// Adapter over Supabase Auth and REST, using plain fetch. Every method is async except
// `user`, and throws an Error with a readable message when a request fails.
const REFRESH_MARGIN_SECONDS = 60;
// The server returns at most 1000 rows per request, so `games` reads in pages of this size.
const PAGE_SIZE = 1000;
const GAME_COLUMNS = "mode,date_key,rows,columns,mines,seed,start,no_guess,won,seconds,three_bv,assisted,moves,created_at";

const nowSeconds = () => Math.floor(Date.now() / 1000);

function failure(status, body) {
  const message = body && typeof body === "object" ? body.msg ?? body.message ?? body.error_description ?? body.error : null;
  return new Error(typeof message === "string" && message ? message : `Request failed (${status}).`);
}

// `session` is { load(), save(session | null) }; `fetch` is called as fetch(url, init).
export function createSupabase({ url, key, fetch: send, session: sessionStore }) {
  let current = sessionStore.load();
  let refreshing = null;

  function setSession(next) {
    current = next;
    sessionStore.save(next);
  }

  function sessionFrom(body) {
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at ?? nowSeconds() + body.expires_in,
      user: body.user,
    };
  }

  async function request(path, { method = "GET", body, headers = {}, token = current?.access_token } = {}) {
    const init = { method, headers: { apikey: key, ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await send(`${url}${path}`, init);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body only matters for its status.
    }
    if (!response.ok) throw failure(response.status, data);
    return data;
  }

  // One refresh at a time: refresh tokens are single use.
  function refresh() {
    refreshing ??= request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: current.refresh_token },
      token: null,
    })
      .then((body) => setSession(sessionFrom(body)))
      .catch((error) => {
        setSession(null);
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  // Every request that is not an auth call goes through here so the token is fresh.
  async function api(path, options) {
    if (current && current.expires_at - nowSeconds() < REFRESH_MARGIN_SECONDS) await refresh();
    return request(path, options);
  }

  function requireUser() {
    if (!current) throw new Error("Sign in first.");
    return current.user.id;
  }

  async function authenticate(path, body) {
    const data = await request(path, { method: "POST", body, token: null });
    if (data.access_token) setSession(sessionFrom(data));
    return data;
  }

  return {
    user: () => current?.user ?? null,

    async signUp(email, password, username) {
      const data = await authenticate("/auth/v1/signup", { email, password, data: { username } });
      return { user: data.user ?? data, signedIn: Boolean(data.access_token) };
    },

    async signIn(email, password) {
      await authenticate("/auth/v1/token?grant_type=password", { email, password });
      return current.user;
    },

    async signOut() {
      try {
        if (current) await request("/auth/v1/logout", { method: "POST" });
      } catch {
        // The session is cleared either way.
      }
      setSession(null);
    },

    async usernameTaken(name) {
      const rows = await api(`/rest/v1/profiles?select=id&username=eq.${encodeURIComponent(name)}`);
      return rows.length > 0;
    },

    async profile() {
      const rows = await api(`/rest/v1/profiles?select=username,stats_reset_at&id=eq.${requireUser()}`);
      return rows[0] ?? null;
    },

    // Returns the time it stored.
    async resetStats() {
      const stats_reset_at = new Date().toISOString();
      await api(`/rest/v1/profiles?id=eq.${requireUser()}`, {
        method: "PATCH",
        body: { stats_reset_at },
        headers: { Prefer: "return=minimal" },
      });
      return stats_reset_at;
    },

    async saveGame(row) {
      await api("/rest/v1/games", { method: "POST", body: row, headers: { Prefer: "return=minimal" } });
    },

    // The player's own games, oldest first.
    async games() {
      const rows = [];
      for (;;) {
        const page = await api(`/rest/v1/games?select=${GAME_COLUMNS}&order=created_at.asc,id.asc&limit=${PAGE_SIZE}&offset=${rows.length}`);
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    },

    // Works signed out. `date` only matters for the daily mode.
    topTimes: (mode, date = null, limit = 20) =>
      api("/rest/v1/rpc/top_times", { method: "POST", body: { p_mode: mode, p_date: date, p_limit: limit } }),
  };
}
