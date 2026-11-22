// ==UserScript==
// @name         CJU HIVE iOS
// @namespace    cju-hive-ios-thin
// @version      1.1
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
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  if (pageWin.__CJU_IOS_THIN__) return;
  pageWin.__CJU_IOS_THIN__ = true;

  var SERVER_URL = "https://cjuhiveios.haivu1024.workers.dev";
  var isTopFrame = (window.top === window.self);
  if (!isTopFrame) return;

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) location.reload();
  });

  var wakeLockObj = null;
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !document.hidden) {
        wakeLockObj = await navigator.wakeLock.request("screen");
      }
    } catch (e) {}
  }

  var realAlert = typeof pageWin.alert === "function" ? pageWin.alert.bind(pageWin) : window.alert.bind(window);

  function applyServerHook(hookCode) {
    if (!hookCode || typeof hookCode !== "string") return;
    try {
      var s = document.createElement("script");
      s.textContent = hookCode;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {}
  }

  // Lưu trữ an toàn tương thích mọi app Userscript iOS (Userscripts, Stay, Tampermonkey)
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
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  async function storeSet(key, val) {
    var wroteGm = false;
    try {
      if (typeof GM_setValue === "function") {
        var r1 = GM_setValue(key, String(val));
        if (r1 && typeof r1.then === "function") await r1;
        wroteGm = true;
      } else if (typeof GM !== "undefined" && GM && typeof GM.setValue === "function") {
        await GM.setValue(key, String(val));
        wroteGm = true;
      }
    } catch (e) {}
    if (!wroteGm) {
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
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
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
      for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      id = "DEV-" + hex.toUpperCase();
      await storeSet("CJU_IOS_DEV_ID", id);
    }
    return id;
  }

  async function getSession() {
    try {
      var raw = await storeGet("CJU_IOS_SESS");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function saveSession(sess) {
    await storeSet("CJU_IOS_SESS", JSON.stringify(sess));
  }

  async function clearSession() {
    await storeDel("CJU_IOS_SESS");
  }

  // Gọi API: Ưu tiên fetch() gốc của Safari (nhanh, chuẩn UA iOS), tự dự phòng GM_xmlhttpRequest
  function gmPostFallback(url, headers, bodyStr) {
    return new Promise(function (resolve) {
      var gmXhr = typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : null);

      if (!gmXhr) {
        resolve({ status: 0, data: { ok: false, message: "Không thể kết nối máy chủ." } });
        return;
      }

      var settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }

      var timer = setTimeout(function () {
        done({ status: 0, data: { ok: false, message: "Hết thời gian chờ máy chủ." } });
      }, 10000);

      try {
        gmXhr({
          method: "POST",
          url: url,
          headers: headers,
          data: bodyStr,
          timeout: 10000,
          onload: function (res) {
            var data = null;
            try { data = JSON.parse(res.responseText); } catch (e) {
              data = { ok: false, message: "Phản hồi không hợp lệ." };
            }
            done({ status: res.status || 0, data: data });
          },
          onerror: function () {
            done({ status: 0, data: { ok: false, message: "Lỗi mạng khi gọi máy chủ." } });
          },
          ontimeout: function () {
            done({ status: 0, data: { ok: false, message: "Quá thời gian kết nối." } });
          }
        });
      } catch (e) {
        done({ status: 0, data: { ok: false, message: "Lỗi kết nối: " + (e && e.message ? e.message : "unknown") } });
      }
    });
  }

  async function apiPost(path, body, accessToken) {
    var fullUrl = SERVER_URL + path;
    var headers = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = "Bearer " + accessToken;
    var bodyStr = JSON.stringify(body || {});

    try {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
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
      try {
        data = await res.json();
      } catch (e) {
        data = { ok: false, message: "Phản hồi máy chủ không hợp lệ (HTTP " + res.status + ")." };
      }
      return { status: res.status, data: data };
    } catch (fetchErr) {
      return await gmPostFallback(fullUrl, headers, bodyStr);
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

  function buildIOSWidget(handlers) {
    if (document.getElementById("cju-widget")) return null;

    var widget = document.createElement("div");
    widget.id = "cju-widget";
    widget.style.cssText =
      "position:fixed;top:max(8px,env(safe-area-inset-top));right:8px;z-index:999999;width:170px;" +
      "background:rgba(248,250,252,0.95);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);" +
      "color:#334155;padding:6px 8px;border-radius:8px;font-size:10px;font-family:-apple-system,system-ui,sans-serif;" +
      "box-shadow:0 3px 10px rgba(15,23,42,0.1);border:1px solid #dbeafe;display:flex;flex-direction:column;" +
      "gap:4px;box-sizing:border-box;-webkit-user-select:none;user-select:none;";

    var header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:4px;";
    var brand = document.createElement("span");
    brand.textContent = "⚡ CJU Auto";
    brand.style.cssText = "font-weight:700;font-size:10.5px;color:#0284c7;";

    var toggleBtn = document.createElement("button");
    var btnBase = "margin:0;padding:1px 6px;border-radius:999px;cursor:pointer;font-weight:700;font-size:9.5px;touch-action:manipulation;";
    var isEnabled = localStorage.getItem("cju_auto_enabled") !== "false";

    function renderToggle() {
      toggleBtn.textContent = isEnabled ? "● BẬT" : "○ TẮT";
      toggleBtn.style.cssText = btnBase + (isEnabled
        ? "background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;"
        : "background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;");
    }
    renderToggle();
    toggleBtn.addEventListener("click", function () {
      isEnabled = !isEnabled;
      localStorage.setItem("cju_auto_enabled", isEnabled ? "true" : "false");
      renderToggle();
      if (handlers.onToggle) handlers.onToggle(isEnabled);
    });

    header.appendChild(brand);
    header.appendChild(toggleBtn);

    var statusEl = document.createElement("div");
    statusEl.textContent = "Khởi động...";
    statusEl.style.cssText =
      "color:#475569;background:#f1f5f9;padding:3px 6px;border-radius:5px;font-size:10px;" +
      "text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;";

    var manualBtn = document.createElement("button");
    manualBtn.textContent = "▶ Học ngay";
    manualBtn.style.cssText =
      "flex:1;margin:0;padding:4px 5px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;" +
      "border-radius:5px;font-size:10px;font-weight:600;touch-action:manipulation;";
    manualBtn.addEventListener("click", function () {
      if (handlers.onManual) handlers.onManual();
    });

    var keyBtn = document.createElement("button");
    keyBtn.textContent = "🔑 Key";
    keyBtn.style.cssText =
      "margin:0;padding:4px 6px;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;" +
      "border-radius:5px;font-size:10px;font-weight:600;touch-action:manipulation;";

    row.appendChild(manualBtn);
    row.appendChild(keyBtn);

    var keyBox = document.createElement("div");
    keyBox.style.cssText = "display:none;flex-direction:column;gap:3px;padding-top:4px;border-top:1px dashed #cbd5e1;";

    var inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;gap:3px;";

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
    keyMsg.style.cssText = "display:none;font-size:9.5px;color:#dc2626;line-height:1.25;word-break:break-word;";

    inputRow.appendChild(keyInput);
    inputRow.appendChild(saveBtn);
    keyBox.appendChild(inputRow);
    keyBox.appendChild(keyMsg);

    keyBtn.addEventListener("click", function () {
      keyBox.style.display = keyBox.style.display === "flex" ? "none" : "flex";
    });

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
        var res = await handlers.onActivateKey(val);
        if (res && res.ok) {
          statusEl.textContent = "✅ Đang tải lại...";
          location.reload();
          return;
        }
        keyMsg.textContent = (res && res.message) || "Key không hợp lệ!";
        keyMsg.style.display = "block";
      } catch (e) {
        keyMsg.textContent = "Lỗi: " + (e && e.message ? e.message : "Không xác định");
        keyMsg.style.display = "block";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Lưu";
      }
    }

    saveBtn.addEventListener("click", doSave);
    keyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doSave();
    });

    widget.appendChild(header);
    widget.appendChild(statusEl);
    widget.appendChild(row);
    widget.appendChild(keyBox);
    document.body.appendChild(widget);

    return {
      setMsg: function (t) { statusEl.textContent = String(t || ""); },
      openKeyBox: function (err) {
        keyBox.style.display = "flex";
        if (err) {
          keyMsg.textContent = String(err);
          keyMsg.style.display = "block";
        }
      },
      isEnabled: function () { return isEnabled; }
    };
  }

  function extractByRecipe(recipe) {
    if (!recipe || !recipe.btnText || !recipe.cardKey || !recipe.btnSel) {
      return { clickables: [], payload: [] };
    }
    var btnText = String(recipe.btnText);
    var cardKey = String(recipe.cardKey);
    var btnSel = String(recipe.btnSel);
    var maxLen = Number(recipe.maxLen || 350);

    var all = document.querySelectorAll("*");
    var matched = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length === 0 && (el.innerText || el.value || "").trim() === btnText) {
        matched.push(el);
      }
    }

    var clickables = [];
    var payload = [];
    for (var j = 0; j < matched.length; j++) {
      var clickable = matched[j].closest(btnSel) || matched[j];
      var card = clickable.parentElement;
      while (card && card !== document.body) {
        if (card.innerText && card.innerText.indexOf(cardKey) !== -1) {
          var sub = card.querySelectorAll("*");
          var cnt = 0;
          for (var k = 0; k < sub.length; k++) {
            if (sub[k].children.length === 0 && (sub[k].innerText || sub[k].value || "").trim() === btnText) {
              cnt++;
            }
          }
          if (cnt === 1) break;
        }
        card = card.parentElement;
      }
      if (!card) continue;
      clickables.push(clickable);
      payload.push({ text: (card.innerText || "").slice(0, maxLen) });
    }
    return { clickables: clickables, payload: payload };
  }

  function runMainMode(recipe) {
    if (!recipe || !recipe.btnText || !recipe.cardKey) return;
    try { localStorage.setItem("cju_main_page_url", window.location.href); } catch (e) {}

    if (recipe.forceSameTab) {
      try {
        pageWin.open = function (targetUrl) {
          if (targetUrl && typeof targetUrl === "string" && targetUrl !== "about:blank") {
            window.location.href = targetUrl;
          }
          return window;
        };
        var origSubmit = HTMLFormElement.prototype.submit;
        HTMLFormElement.prototype.submit = function () {
          if (this.target && this.target !== "_self") this.target = "_self";
          return origSubmit.apply(this, arguments);
        };
      } catch (e) {}
    }

    var waitTimer = null;
    var isBusy = false;

    var ui = buildIOSWidget({
      onToggle: function (on) {
        if (on) {
          loadPlan();
        } else {
          if (waitTimer) clearInterval(waitTimer);
          ui.setMsg("⏸ Đã tạm dừng");
        }
      },
      onManual: function () {
        if (waitTimer) clearInterval(waitTimer);
        openNextAuthorized();
      },
      onActivateKey: activateKey
    });

    if (!ui) return;

    async function loadPlan() {
      if (waitTimer) clearInterval(waitTimer);
      if (!ui.isEnabled()) {
        ui.setMsg("⏸ Đang TẮT");
        return;
      }

      ui.setMsg("Đang xác thực...");
      var extracted = extractByRecipe(recipe);
      if (extracted.payload.length === 0) {
        ui.setMsg("Không thấy bài học");
        return;
      }

      var plan = await authorizedCall("/api/v1/session/next-action", {
        lessons: extracted.payload,
        mode: "plan"
      });

      if (!plan || !plan.ok) {
        if (plan && plan.authFailed) {
          ui.setMsg("🔒 Phiên hết hạn");
          ui.openKeyBox(plan.message);
        } else {
          ui.setMsg("⚠️ Lỗi kết nối");
        }
        return;
      }

      if (plan.action === "ALL_DONE") {
        ui.setMsg("🎉 Đã học xong 100%!");
        return;
      }

      var endAt = Date.now() + Number(plan.delaySeconds || 25) * 1000;
      var tick = function () {
        if (!ui.isEnabled()) {
          clearInterval(waitTimer);
          return;
        }
        var rem = Math.ceil((endAt - Date.now()) / 1000);
        if (rem > 0) {
          ui.setMsg("Phát sau " + rem + "s");
        } else {
          clearInterval(waitTimer);
          openNextAuthorized();
        }
      };
      tick();
      waitTimer = setInterval(tick, 1000);
    }

    async function openNextAuthorized() {
      if (isBusy) return;
      isBusy = true;

      var extracted = extractByRecipe(recipe);
      var plan = await authorizedCall("/api/v1/session/next-action", {
        lessons: extracted.payload,
        mode: "execute"
      });

      if (!plan || !plan.ok || plan.action !== "OPEN_LESSON" || !extracted.clickables[plan.targetIndex]) {
        isBusy = false;
        if (plan && plan.authFailed) {
          ui.setMsg("🔒 Phiên hết hạn");
          ui.openKeyBox(plan.message);
        } else if (plan && plan.action === "ALL_DONE") {
          ui.setMsg("🎉 Đã học xong 100%!");
        } else {
          ui.setMsg("⚠️ Lỗi xác thực");
        }
        return;
      }

      ui.setMsg("Mở " + plan.targetName + "...");
      var target = extracted.clickables[plan.targetIndex];
      if (plan.openRule && plan.openRule.forceSameTab && target.tagName === "A") {
        target.setAttribute("target", plan.openRule.targetAttr || "_self");
      }
      target.click();
      setTimeout(function () { isBusy = false; }, 5000);
    }

    loadPlan();
  }

  function runPlayerMode(playToken, dir) {
    if (!playToken || !dir || !dir.vSel || !dir.actSel || !Array.isArray(dir.labels)) {
      return;
    }

    if (dir.pageHook) {
      applyServerHook(dir.pageHook);
    }

    requestWakeLock();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) requestWakeLock();
    });

    var isDone = false;

    function getDocs() {
      var docs = [document];
      var iframes = document.querySelectorAll("iframe");
      for (var i = 0; i < iframes.length; i++) {
        try {
          if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument);
        } catch (e) {}
      }
      return docs;
    }

    var dlgTimer = setInterval(function () {
      if (isDone) return;
      var docs = getDocs();
      for (var d = 0; d < docs.length; d++) {
        var els = docs[d].querySelectorAll(dir.actSel);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.offsetParent === null) continue;
          var txt = (el.innerText || el.value || "").trim();
          if (!txt || txt.length > 24) continue;
          var hit = false;
          for (var w = 0; w < dir.labels.length; w++) {
            var kw = dir.labels[w];
            if (txt === kw || txt.indexOf(kw) !== -1) {
              hit = true;
              break;
            }
          }
          if (hit) {
            try { el.click(); } catch (e) {}
          }
        }
      }
    }, Number(dir.dlgMs || 800));

    async function handleFinish(videoEl) {
      if (isDone) return;
      isDone = true;
      clearInterval(dlgTimer);
      if (wakeLockObj) {
        try { wakeLockObj.release(); } catch (e) {}
        wakeLockObj = null;
      }

      var verify = await authorizedCall("/api/v1/session/complete", {
        playToken: playToken,
        observedDuration: videoEl ? Number(videoEl.duration || 0) : 0,
        currentTime: videoEl ? Number(videoEl.currentTime || 0) : 0
      });

      if (!verify || !verify.ok) {
        if (verify && verify.authFailed) {
          realAlert((verify.message || "Key đã hết hạn.") + "\n\n🔒 Đã tự động đăng xuất.");
        }
      }

      var closeRule = (verify && verify.ok && verify.closeRule) ? verify.closeRule : { waitSeconds: 2 };
      var waitMs = Number(closeRule.waitSeconds || 20) * 1000;

      setTimeout(function () {
        if (closeRule.closeFn && typeof pageWin[closeRule.closeFn] === "function") {
          try { pageWin[closeRule.closeFn](); } catch (e) {}
        }
        var mainUrl = localStorage.getItem("cju_main_page_url");
        if (mainUrl) {
          window.top.location.href = mainUrl;
        } else {
          window.top.history.back();
        }
      }, waitMs);
    }

    var vidTimer = setInterval(function () {
      if (isDone) {
        clearInterval(vidTimer);
        return;
      }
      var docs = getDocs();
      for (var d = 0; d < docs.length; d++) {
        var vids = docs[d].querySelectorAll(dir.vSel);
        for (var i = 0; i < vids.length; i++) {
          var v = vids[i];
          if (dir.mute) {
            v.muted = true;
            v.defaultMuted = true;
            v.setAttribute("muted", "");
          }
          if (dir.inline) {
            v.playsInline = true;
            v.setAttribute("playsinline", "");
            v.setAttribute("webkit-playsinline", "");
          }
          if (!v.__cjuBound) {
            v.__cjuBound = true;
            (function (vid) {
              vid.addEventListener("ended", function () { handleFinish(vid); });
            })(v);
          }
          var valid = Number.isFinite(v.duration) && v.duration > Number(dir.minDur);
          var ended = v.ended || (valid && v.currentTime >= v.duration - Number(dir.margin));
          if (ended && v.paused) {
            handleFinish(v);
            return;
          }
          if (v.paused && !ended) {
            var p = v.play();
            if (p && typeof p.catch === "function") p.catch(function () {});
          }
        }
      }
    }, Number(dir.pollMs || 1000));
  }

  async function boot() {
    var sess = await getSession();
    if (!sess) {
      if (location.pathname.indexOf("/classroom/") !== -1) {
        var loginUi = buildIOSWidget({
          onToggle: function () {},
          onManual: function () { loginUi.openKeyBox("Vui lòng nhập Key trước!"); },
          onActivateKey: activateKey
        });
        if (loginUi) {
          loginUi.setMsg("🔑 Chưa nhập Key");
          loginUi.openKeyBox("Nhập Key iOS để kích hoạt");
        }
      }
      return;
    }

    if (location.pathname.indexOf("/classroom/main.do") !== -1 && localStorage.getItem("cju_auto_enabled") !== "false") {
      var hookRes = await authorizedCall("/api/v1/session/main-hook", {
        pathname: location.pathname
      });
      if (hookRes && hookRes.ok && hookRes.mainHook) {
        applyServerHook(hookRes.mainHook);
      }
    }

    var bootRes = await authorizedCall("/api/v1/session/bootstrap", {
      pathname: location.pathname,
      isTop: isTopFrame
    });

    if (!bootRes || !bootRes.ok) {
      if (bootRes && bootRes.authFailed && location.pathname.indexOf("/classroom/") !== -1) {
        var errUi = buildIOSWidget({
          onToggle: function () {},
          onManual: function () {},
          onActivateKey: activateKey
        });
        if (errUi) {
          errUi.setMsg("🔒 Phiên hết hạn");
          errUi.openKeyBox(bootRes.message);
        }
      }
      return;
    }

    if (bootRes.pageType === "main" && bootRes.recipe) {
      runMainMode(bootRes.recipe);
    } else if (bootRes.pageType === "player" && bootRes.playToken && bootRes.directive) {
      if (localStorage.getItem("cju_auto_enabled") === "false") return;
      runPlayerMode(bootRes.playToken, bootRes.directive);
    }
  }

  boot();
})();
