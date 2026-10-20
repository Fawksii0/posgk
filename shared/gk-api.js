(() => {
  "use strict";

  const SUPABASE_PROJECT_URL = "https://vclkvecwwhqwbmkcobon.supabase.co";
  const API_URL = window.GK_API_URL || (
    window.GK_SUPABASE_URL
      ? `${String(window.GK_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/gk-api`
      : ["localhost", "127.0.0.1"].includes(location.hostname)
      ? `${SUPABASE_PROJECT_URL}/functions/v1/gk-api`
      : /(^|\.)gkfood\.store$/.test(location.hostname)
        ? `${SUPABASE_PROJECT_URL}/functions/v1/gk-api`
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
      const stored = sessionStorage.getItem(`${SESSION_PREFIX}${scope}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      throw new ApiError("Impossible de lire la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
  }

  function setSession(scope, result) {
    if (!result?.token || !result?.user) throw new ApiError("Réponse de connexion invalide.", 0, "invalid_session");
    const previous = session(scope);
    try {
      sessionStorage.setItem(`${SESSION_PREFIX}${scope}`, JSON.stringify({
        token: result.token,
        refreshToken: result.refreshToken || previous?.refreshToken || null,
        user: result.user,
        mustChange: !!result.mustChange
      }));
    } catch (error) {
      throw new ApiError("Impossible d'enregistrer la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
    return session(scope);
  }

  function clearSession(scope) {
    try {
      sessionStorage.removeItem(`${SESSION_PREFIX}${scope}`);
    } catch (error) {
      throw new ApiError("Impossible d'effacer la session dans ce navigateur.", 0, "storage_error", { cause: error });
    }
  }

  function getBranch() {
    try {
      return sessionStorage.getItem(BRANCH_KEY) || "";
    } catch (error) {
      throw new ApiError("Impossible de lire le restaurant sélectionné.", 0, "storage_error", { cause: error });
    }
  }

  function setBranch(branchId) {
    if (typeof branchId !== "string" || !branchId) throw new ApiError("Restaurant sélectionné invalide.", 0, "invalid_branch");
    try {
      sessionStorage.setItem(BRANCH_KEY, branchId);
    } catch (error) {
      throw new ApiError("Impossible d'enregistrer le restaurant sélectionné.", 0, "storage_error", { cause: error });
    }
    return branchId;
  }

  function clearBranch() {
    try {
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

  async function request(path, { method = "GET", body, scope } = {}) {
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
    // The database lives in eu-west-1; running the function there avoids a cross-region hop per query.
    if (/\.supabase\.co\//.test(API_URL)) headers["x-region"] = "eu-west-1";

    let response;
    try {
      response = await fetch(`${API_URL.replace(/\/+$/, "")}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
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
      sessionStorage.removeItem(`${SESSION_PREFIX}${data.scope}`);
      setSession(data.scope, { token: data.token, user: data.user, mustChange: false });
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
    get: (path, scope) => request(path, { scope }),
    post: (path, body, scope) => request(path, { method: "POST", body, scope }),
    put: (path, body, scope) => request(path, { method: "PUT", body, scope }),
    patch: (path, body, scope) => request(path, { method: "PATCH", body, scope }),
    delete: (path, scope) => request(path, { method: "DELETE", scope })
  });
})();
