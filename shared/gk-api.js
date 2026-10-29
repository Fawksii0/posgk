(() => {
  "use strict";

  const SUPABASE_PROJECT_URL = "https://oxqfnhnxdnwnftduikkh.supabase.co";
  const FLY_API_URL = "https://gk-api-paris.fly.dev";
  const API_URL = window.GK_API_URL || (
    window.GK_SUPABASE_URL
      ? `${String(window.GK_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/gk-api`
      : ["localhost", "127.0.0.1"].includes(location.hostname)
      ? FLY_API_URL
      : /(^|\.)gkfood\.store$/.test(location.hostname)
        ? FLY_API_URL
        : ""
  );
  const SESSION_PREFIX = "gk-api-session:";
  const BRANCH_KEY = "gk-api-branch";
  const refreshes = new Map();

  class ApiError extends Error {
    constructor(message, status = 0, code = "network_error", details = {}) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function session(scope) {
    try {
      const key = `${SESSION_PREFIX}${scope}`;
      let stored = localStorage.getItem(key);
      if (!stored) {
        stored = sessionStorage.getItem(key);
        // Migrate sessions created by older releases so closing the browser no longer logs users out.
        if (stored) {
          localStorage.setItem(key, stored);
          sessionStorage.removeItem(key);
        }
      }
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      throw new ApiError("Impossible de lire la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
  }

  function setSession(scope, result, { persistent = true } = {}) {
    if (!result?.token || !result?.user) throw new ApiError("Réponse de connexion invalide.", 0, "invalid_session");
    const previous = session(scope);
    try {
      const key = `${SESSION_PREFIX}${scope}`;
      const value = JSON.stringify({
        token: result.token,
        refreshToken: result.refreshToken || previous?.refreshToken || null,
        user: result.user,
        mustChange: !!result.mustChange
      });
      if (persistent) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch (error) {
      throw new ApiError("Impossible d'enregistrer la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
    return session(scope);
  }

  function clearSession(scope) {
    try {
      localStorage.removeItem(`${SESSION_PREFIX}${scope}`);
      sessionStorage.removeItem(`${SESSION_PREFIX}${scope}`);
    } catch (error) {
      throw new ApiError("Impossible d'effacer la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
  }

  function getBranch() {
    try {
      let branch = localStorage.getItem(BRANCH_KEY) || "";
      if (!branch) {
        branch = sessionStorage.getItem(BRANCH_KEY) || "";
        if (branch) {
          localStorage.setItem(BRANCH_KEY, branch);
          sessionStorage.removeItem(BRANCH_KEY);
        }
      }
      return branch;
    } catch (error) {
      throw new ApiError("Impossible de lire le restaurant sélectionné.", 0, "storage_error", { cause: error });
    }
  }

  function setBranch(branchId) {
    if (typeof branchId !== "string" || !branchId) throw new ApiError("Restaurant sélectionné invalide.", 0, "invalid_branch");
    try {
      localStorage.setItem(BRANCH_KEY, branchId);
      sessionStorage.removeItem(BRANCH_KEY);
    } catch (error) {
      throw new ApiError("Impossible d'enregistrer le restaurant sélectionné.", 0, "storage_error", { cause: error });
    }
    return branchId;
  }

  function clearBranch() {
    try {
      localStorage.removeItem(BRANCH_KEY);
      sessionStorage.removeItem(BRANCH_KEY);
    } catch (error) {
      throw new ApiError("Impossible d'effacer le restaurant sélectionné.", 0, "storage_error", { cause: error });
    }
  }

  function tokenExpiresSoon(token) {
    try {
      const payload = token.split(".")[1];
      if (!payload) return false;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)));
      return Number(claims.exp) > 0 && Number(claims.exp) < Math.floor(Date.now() / 1000) + 60;
    } catch {
      return false;
    }
  }

  async function refreshSession(scope, current) {
    if (!current?.refreshToken) return current;
    if (refreshes.has(scope)) return refreshes.get(scope);
    const pending = request("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: current.refreshToken }
    }).then(result => setSession(scope, result)).catch(error => {
      clearSession(scope);
      window.dispatchEvent(new CustomEvent("gk-api-session-expired", { detail: { scope } }));
      throw error;
    }).finally(() => refreshes.delete(scope));
    refreshes.set(scope, pending);
    return pending;
  }

  async function logout(scope) {
    let failure = null;
    try {
      await request("/api/auth/revoke", { method: "POST", body: {}, scope });
    } catch (error) {
      failure = error;
    }
    clearSession(scope);
    if (failure) throw failure;
  }

  async function request(path, { method = "GET", body, scope, signal } = {}) {
    if (!API_URL) throw new ApiError("Configurez GK_SUPABASE_URL ou GK_API_URL pour connecter cette application au serveur G&K.", 0, "api_url_missing");
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let current = null;
    if (scope) {
      current = session(scope);
      if (!current?.token) throw new ApiError("Connexion requise.", 401, "unauthorized");
      if (tokenExpiresSoon(current.token)) current = await refreshSession(scope, current);
      headers.Authorization = `Bearer ${current.token}`;
    }
    const branchId = getBranch();
    if (branchId) headers["X-GK-Branch"] = branchId;
    // Pin the Edge Function next to the Paris database (eu-west-3).
    if (/\.supabase\.co\//.test(API_URL)) headers["x-region"] = "eu-west-3";

    let response;
    try {
      response = await fetch(`${API_URL.replace(/\/+$/, "")}${path}`, {
        method,
        headers,
        ...(signal ? { signal } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new ApiError("Impossible de joindre le serveur G&K. Vérifiez votre connexion.", 0, "network_error", { cause: error });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError("Le serveur G&K a renvoyé une réponse invalide.", response.status, "invalid_response", { cause: error });
    }
    if (!response.ok) {
      const detail = payload?.error || {};
      if (response.status === 401 && scope) {
        clearSession(scope);
        window.dispatchEvent(new CustomEvent("gk-api-session-expired", { detail: { scope } }));
      }
      throw new ApiError(detail.message || `Erreur serveur (${response.status}).`, response.status, detail.code || "request_failed", detail);
    }
    return payload;
  }

  // Owner "view as" hand-off: the admin opens #gk-view=<base64url JSON> on the target app. Consumed once, then removed from the URL.
  (function consumeOwnerView() {
    const match = /(?:^#|&)gk-view=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!match) return;
    try {
      history.replaceState(null, "", location.pathname + location.search);
      const normalized = match[1].replace(/-/g, "+").replace(/_/g, "/");
      const data = JSON.parse(decodeURIComponent(escape(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)))));
      if (!["client", "courier", "cuisine"].includes(data.scope) || !data.token || !data.user) return;
      clearSession(data.scope);
      // Owner impersonation remains tab-scoped even though normal sign-ins are persistent.
      setSession(data.scope, { token: data.token, user: data.user, mustChange: false }, { persistent: false });
      if (typeof data.branchId === "string" && data.branchId) setBranch(data.branchId);
    } catch { /* an invalid hand-off is ignored; the normal sign-in screen appears */ }
  })();

  window.GKApi = Object.freeze({
    ApiError,
    session,
    setSession,
    clearSession,
    getBranch,
    setBranch,
    clearBranch,
    logout,
    request,
    get: (path, scope, extra) => request(path, { scope, ...(extra || {}) }),
    post: (path, body, scope) => request(path, { method: "POST", body, scope }),
    put: (path, body, scope) => request(path, { method: "PUT", body, scope }),
    patch: (path, body, scope) => request(path, { method: "PATCH", body, scope }),
    delete: (path, scope) => request(path, { method: "DELETE", scope })
  });
})();
