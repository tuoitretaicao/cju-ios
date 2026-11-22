// ==UserScript==
// @name         CJU HIVE iOS
// @namespace    cju-hive-ios-loader
// @version      1.3
// @match        https://hive.cju.ac.kr/*
// @connect      cjuhiveios.haivu1024.workers.dev
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  if (pageWin.__CJU_IOS_LOADER__) return;
  pageWin.__CJU_IOS_LOADER__ = true;

  var isTopFrame = (window.top === window.self);
  if (!isTopFrame) return;

  var initPath = location.pathname || "";
  if (initPath.indexOf("/login") !== -1 || initPath.indexOf("/common/greeting.do") !== -1) return;

  var SERVER_URL = "https://cjuhiveios.haivu1024.workers.dev";

  function injectCode(code) {
    if (!code || typeof code !== "string") return;
    try {
      var s = document.createElement("script");
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {}
  }

  (function consumeTransientPreHook() {
    if (localStorage.getItem("cju_auto_enabled") === "false") return;
    try {
      var raw = localStorage.getItem("cju_ph_tmp");
      if (!raw) return;
      localStorage.removeItem("cju_ph_tmp");
      var obj = JSON.parse(raw);
      if (obj && obj.code && Number(obj.exp || 0) > Date.now()) {
        injectCode(obj.code);
      }
    } catch (e) {}
  })();

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) location.reload();
  });

  function whenBodyReady(cb) {
    if (document.body) {
      cb();
      return;
    }
    var fired = false;
    function run() {
      if (fired || !document.body) return;
      fired = true;
      cb();
    }
    window.addEventListener("DOMContentLoaded", run);
    window.addEventListener("load", run);
  }

  function createBridgeKey() {
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  async function storeGet(key) {
    try {
      if (typeof GM_getValue === "function") {
        var v1 = GM_getValue(key, "");
        if (v1 && typeof v1.then === "function") v1 = await v1;
        if (v1 !== undefined && v1 !== null && v1 !== "") return String(v1);
      } else if (typeof GM !== "undefined" && GM && typeof GM.getValue === "function") {
        var v2 = await GM.getValue(key, "");
        if (v2 !== undefined && v2 !== null && v2 !== "") return String(v2);
      }
    } catch (e) {}
    try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
  }

  async function storeSet(key, val) {
    var wrote = false;
    try {
      if (typeof GM_setValue === "function") {
        var r1 = GM_setValue(key, String(val));
        if (r1 && typeof r1.then === "function") await r1;
        wrote = true;
      } else if (typeof GM !== "undefined" && GM && typeof GM.setValue === "function") {
        await GM.setValue(key, String(val));
        wrote = true;
      }
    } catch (e) {}
    if (!wrote) {
      try { localStorage.setItem(key, String(val)); } catch (e) {}
    }
  }

  async function storeDel(key) {
    try {
      if (typeof GM_deleteValue === "function") {
        var r1 = GM_deleteValue(key);
        if (r1 && typeof r1.then === "function") await r1;
      } else if (typeof GM !== "undefined" && GM && typeof GM.deleteValue === "function") {
        await GM.deleteValue(key);
      }
    } catch (e) {}
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function collectIOSEnv() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    return {
      ua: navigator.userAgent || "",
      platform: navigator.platform || "",
      maxTouchPoints: Number(navigator.maxTouchPoints || 0),
      screenW: Number(screen.width || 0),
      screenH: Number(screen.height || 0),
      dpr: Number(window.devicePixelRatio || 1),
      tz: tz
    };
  }

  async function getOrCreateDeviceId() {
    var id = await storeGet("CJU_IOS_DEV_ID");
    if (!/^DEV-[A-Z0-9-]{8,48}$/.test(id)) {
      var bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      var hex = "";
      for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
      id = "DEV-" + hex.toUpperCase();
      await storeSet("CJU_IOS_DEV_ID", id);
    }
    return id;
  }

  async function getSession() {
    try {
      var raw = await storeGet("CJU_IOS_SESS");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function saveSession(sess) { await storeSet("CJU_IOS_SESS", JSON.stringify(sess)); }
  async function clearSession() { await storeDel("CJU_IOS_SESS"); }

  function gmPostPrimary(url, headers, bodyStr) {
    return new Promise(function (resolve) {
      var gmXhr = typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : null);

      if (!gmXhr) {
        resolve({ fallback: true });
        return;
      }

      var settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }

      var timer = setTimeout(function () { done({ fallback: true }); }, 6500);

      try {
        gmXhr({
          method: "POST",
          url: url,
          headers: headers,
          data: bodyStr,
          timeout: 6500,
          onload: function (res) {
            if (!res || !res.status) { done({ fallback: true }); return; }
            var data = null;
            try { data = JSON.parse(res.responseText); } catch (e) {
              data = { ok: false, message: "Phản hồi máy chủ không hợp lệ." };
            }
            done({ fallback: false, status: res.status, data: data });
          },
          onerror: function () { done({ fallback: true }); },
          ontimeout: function () { done({ fallback: true }); }
        });
      } catch (e) {
        done({ fallback: true });
      }
    });
  }

  async function apiPost(path, body, accessToken) {
    var fullUrl = SERVER_URL + path;
    var headers = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = "Bearer " + accessToken;
    var bodyStr = JSON.stringify(body || {});

    var gmRes = await gmPostPrimary(fullUrl, headers, bodyStr);
    if (gmRes && !gmRes.fallback) {
      return { status: gmRes.status, data: gmRes.data };
    }

    try {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
      var res = await fetch(fullUrl, {
        method: "POST",
        headers: headers,
        body: bodyStr,
        mode: "cors",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      var data = null;
      try { data = await res.json(); } catch (e) {
        data = { ok: false, message: "Phản hồi không hợp lệ (HTTP " + res.status + ")." };
      }
      return { status: res.status, data: data };
    } catch (e) {
      return { status: 0, data: { ok: false, message: "Không thể kết nối máy chủ." } };
    }
  }

  async function activateKey(licenseKey) {
    try {
      var deviceId = await getOrCreateDeviceId();
      var res = await apiPost("/api/v1/auth/activate", {
        licenseKey: String(licenseKey || "").trim(),
        deviceId: deviceId,
        env: collectIOSEnv()
      }, null);

      if (res.status !== 200 || !res.data || !res.data.ok) {
        return { ok: false, message: (res.data && res.data.message) || ("Kích hoạt thất bại (" + res.status + ").") };
      }
      await saveSession({
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        sessionId: res.data.sessionId,
        accessExpAt: Date.now() + (res.data.expiresIn - 30) * 1000
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: "Lỗi xử lý: " + (err && err.message ? err.message : "unknown") };
    }
  }

  async function ensureToken() {
    var sess = await getSession();
    if (!sess || !sess.accessToken || !sess.refreshToken || !sess.sessionId) {
      return { ok: false, authFailed: true, message: "Chưa kích hoạt Key." };
    }
    if (Date.now() < (sess.accessExpAt || 0)) {
      return { ok: true, accessToken: sess.accessToken };
    }
    var deviceId = await getOrCreateDeviceId();
    var res = await apiPost("/api/v1/auth/refresh", {
      sessionId: sess.sessionId,
      refreshToken: sess.refreshToken,
      deviceId: deviceId,
      env: collectIOSEnv()
    }, null);

    if (res.status !== 200 || !res.data || !res.data.ok) {
      if (res.status === 401 || res.status === 403) await clearSession();
      return {
        ok: false,
        authFailed: res.status === 401 || res.status === 403,
        message: (res.data && res.data.message) || "Phiên đã hết hạn."
      };
    }

    await saveSession({
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
      sessionId: sess.sessionId,
      accessExpAt: Date.now() + (res.data.expiresIn - 30) * 1000
    });
    return { ok: true, accessToken: res.data.accessToken };
  }

  async function authorizedCall(path, payload) {
    var tok = await ensureToken();
    if (!tok.ok) return tok;

    var res = await apiPost(path, payload, tok.accessToken);
    if (res.status === 401 && res.data && res.data.code === "INVALID_TOKEN") {
      var cur = await getSession();
      if (cur) {
        cur.accessExpAt = 0;
        await saveSession(cur);
        tok = await ensureToken();
        if (!tok.ok) return tok;
        res = await apiPost(path, payload, tok.accessToken);
      }
    }

    if (res.status === 401 || res.status === 403) {
      await clearSession();
      return { ok: false, authFailed: true, message: (res.data && res.data.message) || "Phiên đã hết hạn." };
    }
    if (res.status !== 200 || !res.data || !res.data.ok) {
      return { ok: false, code: res.data && res.data.code, message: (res.data && res.data.message) || "Lỗi máy chủ." };
    }
    return res.data;
  }

  function showKeyOnlyWidget(titleMsg, errMsg) {
    if (document.getElementById("cju-widget")) return;

    var widget = document.createElement("div");
    widget.id = "cju-widget";
    widget.style.cssText =
      "position:fixed;top:max(8px,env(safe-area-inset-top));right:8px;z-index:999999;width:170px;" +
      "background:rgba(248,250,252,0.95);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);" +
      "color:#334155;padding:6px 8px;border-radius:8px;font-size:10px;font-family:-apple-system,system-ui,sans-serif;" +
      "box-shadow:0 3px 10px rgba(15,23,42,0.1);border:1px solid #dbeafe;display:flex;flex-direction:column;" +
      "gap:4px;box-sizing:border-box;-webkit-user-select:none;user-select:none;";

    var brand = document.createElement("div");
    brand.textContent = "⚡ CJU Auto";
    brand.style.cssText = "font-weight:700;font-size:10.5px;color:#0284c7;";

    var statusEl = document.createElement("div");
    statusEl.textContent = String(titleMsg || "🔑 Chưa nhập Key");
    statusEl.style.cssText =
      "color:#475569;background:#f1f5f9;padding:3px 6px;border-radius:5px;font-size:10px;text-align:center;";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:3px;";

    var keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "Nhập Key...";
    keyInput.autocomplete = "off";
    keyInput.setAttribute("autocorrect", "off");
    keyInput.setAttribute("autocapitalize", "characters");
    keyInput.spellcheck = false;
    keyInput.style.cssText =
      "flex:1;min-width:0;padding:3px 5px;font-size:11px;border:1px solid #cbd5e1;" +
      "border-radius:4px;background:#ffffff;color:#1e293b;-webkit-user-select:text;user-select:text;";

    var saveBtn = document.createElement("button");
    saveBtn.textContent = "Lưu";
    saveBtn.style.cssText =
      "padding:3px 6px;background:#bae6fd;color:#0369a1;border:1px solid #7dd3fc;" +
      "border-radius:4px;font-size:10px;font-weight:700;touch-action:manipulation;";

    var keyMsg = document.createElement("div");
    keyMsg.style.cssText = "font-size:9.5px;color:#dc2626;line-height:1.25;word-break:break-word;" + (errMsg ? "display:block;" : "display:none;");
    if (errMsg) keyMsg.textContent = String(errMsg);

    async function doSave() {
      var val = keyInput.value.trim();
      if (!val) {
        keyMsg.textContent = "Vui lòng nhập Key!";
        keyMsg.style.display = "block";
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "...";
      keyMsg.style.display = "none";
      try {
        var res = await activateKey(val);
        if (res && res.ok) {
          statusEl.textContent = "✅ Đang tải lại...";
          location.reload();
          return;
        }
        keyMsg.textContent = (res && res.message) || "Key không hợp lệ!";
        keyMsg.style.display = "block";
      } catch (e) {
        keyMsg.textContent = "Lỗi kết nối máy chủ.";
        keyMsg.style.display = "block";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Lưu";
      }
    }

    saveBtn.addEventListener("click", doSave);
    keyInput.addEventListener("keydown", function (e) { if (e.key === "Enter") doSave(); });

    row.appendChild(keyInput);
    row.appendChild(saveBtn);
    widget.appendChild(brand);
    widget.appendChild(statusEl);
    widget.appendChild(row);
    widget.appendChild(keyMsg);
    document.body.appendChild(widget);
  }

  function mountBridge(bridgeKey) {
    var reqCh = "cju_q_" + bridgeKey;
    var resCh = "cju_a_" + bridgeKey;

    pageWin.addEventListener("message", async function (e) {
      if (e.origin !== location.origin) return;
      var d = e.data;
      if (!d || d.ch !== reqCh || !d.id || !d.type) return;

      var out = { ok: false, message: "Yêu cầu không hợp lệ." };
      try {
        if (d.type === "NEXT_ACTION") {
          out = await authorizedCall("/api/v1/session/next-action", {
            lessons: Array.isArray(d.lessons) ? d.lessons : [],
            mode: d.mode === "execute" ? "execute" : "plan"
          });
        } else if (d.type === "COMPLETE_LESSON") {
          out = await authorizedCall("/api/v1/session/complete", {
            playToken: String(d.playToken || ""),
            observedDuration: Number(d.observedDuration || 0),
            currentTime: Number(d.currentTime || 0),
            timeTextMatched: Boolean(d.timeTextMatched)
          });
        } else if (d.type === "ACTIVATE_KEY") {
          out = await activateKey(d.licenseKey);
        }
      } catch (err) {
        out = { ok: false, message: "Lỗi cầu nối." };
      }
      pageWin.postMessage({ ch: resCh, id: d.id, data: out }, location.origin);
    });
  }

  async function boot() {
    var sess = await getSession();
    if (!sess) {
      if (initPath.indexOf("/classroom/") !== -1) {
        whenBodyReady(function () {
          showKeyOnlyWidget("🔑 Chưa nhập Key", "Nhập Key iOS để kích hoạt");
        });
      }
      return;
    }

    var bridgeKey = createBridgeKey();
    var bootRes = await authorizedCall("/api/v1/session/bootstrap", {
      pathname: initPath,
      isTop: isTopFrame,
      bridgeKey: bridgeKey
    });

    if (!bootRes || !bootRes.ok) {
      if (bootRes && bootRes.authFailed && initPath.indexOf("/classroom/") !== -1) {
        whenBodyReady(function () {
          showKeyOnlyWidget("🔒 Phiên hết hạn", bootRes.message);
        });
      }
      return;
    }

    if (bootRes.pageType === "ignore" || !bootRes.runtimeCode) return;
    if (bootRes.pageType === "player" && localStorage.getItem("cju_auto_enabled") === "false") return;

    if (bootRes.pageHook) {
      injectCode(bootRes.pageHook);
    }

    mountBridge(bridgeKey);

    whenBodyReady(function () {
      injectCode(bootRes.runtimeCode);
    });
  }

  boot();
})();
