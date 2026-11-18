// ==UserScript==
// @name         CJU HIVE (Bản Quyền)
// @namespace    cju-hive-helper
// @version      1.1
// @description  Tool CJU HIVE tương thích iOS & Desktop
// @author       Assistant
// @match        *://hive.cju.ac.kr/*
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addElement
// @grant        unsafeWindow
// @grant        window.close
// @run-at       document-end
// @updateURL    https://gist.githubusercontent.com/tuoitretaicao/f0f66a80082f5744e2b0e32d3a3150e7/raw/cju_hive.user.js
// @downloadURL  https://gist.githubusercontent.com/tuoitretaicao/f0f66a80082f5744e2b0e32d3a3150e7/raw/cju_hive.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[CJU] Script bắt đầu chạy (iOS & Desktop Ready)');

    const _encodedUrl = "aHR0cHM6Ly9janVrZXkuaGFpdnUxMDI0LndvcmtlcnMuZGV2";
    const SERVER_URL = atob(_encodedUrl);
    const url = window.location.href;
    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const nativePrompt = pageWin.prompt ? pageWin.prompt.bind(pageWin) : window.prompt.bind(window);
    const nativeAlert = pageWin.alert ? pageWin.alert.bind(pageWin) : window.alert.bind(window);

    if (url.includes('/common/greeting.do') || url.includes('/login')) {
        console.log('[CJU] Bỏ qua trang login/greeting');
        return;
    }

    // Hỗ trợ lưu Device ID đa nền tảng (Tampermonkey + iOS Userscripts)
    function getDeviceId() {
        let id = "";
        try {
            if (typeof GM_getValue === 'function') {
                id = GM_getValue("CJU_BROWSER_ID", "");
            }
        } catch (e) {}

        if (!id) {
            id = localStorage.getItem("CJU_BROWSER_ID") || "";
        }

        if (!id) {
            id = "DEV-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
        }

        try {
            localStorage.setItem("CJU_BROWSER_ID", id);
            if (typeof GM_setValue === 'function') {
                GM_setValue("CJU_BROWSER_ID", id);
            }
        } catch (e) {}

        return id;
    }

    const deviceId = getDeviceId();
    console.log('[CJU] Device ID:', deviceId);

    function promptChangeKey() {
        const currentKey = localStorage.getItem("CJU_TEMP_SESSION_KEY") || "";
        const input = nativePrompt("🔑 Nhập mã Key kích hoạt CJU HIVE của bạn:", currentKey);
        if (input !== null && input.trim() !== "") {
            sessionStorage.setItem("CJU_SESSION_ALIVE", "true");
            localStorage.setItem("CJU_TEMP_SESSION_KEY", input.trim());
            location.reload();
        }
    }

    // Đăng ký menu trên Desktop Tampermonkey
    if (typeof GM_registerMenuCommand === 'function') {
        try {
            GM_registerMenuCommand("🔑 Nhập / Đổi Key CJU HIVE", promptChangeKey);
        } catch (e) {}
    }

    const isMainPage = url.includes('/classroom/main.do');

    // Tạo nút nổi đổi Key trên màn hình (Dành cho iPhone không có Menu Tampermonkey)
    if (isMainPage && window.top === window.self) {
        const keyBtn = document.createElement('button');
        keyBtn.innerText = '🔑 Key';
        keyBtn.style.cssText = 'position:fixed;bottom:15px;left:15px;z-index:999999;padding:6px 12px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:8px;font-size:12px;opacity:0.85;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;';
        keyBtn.onclick = promptChangeKey;
        document.body.appendChild(keyBtn);
    }

    let activeKey = "";

    if (isMainPage && window.top === window.self) {
        const isSessionAlive = sessionStorage.getItem("CJU_SESSION_ALIVE");
        const savedKey = localStorage.getItem("CJU_TEMP_SESSION_KEY");

        if (!isSessionAlive || !savedKey) {
            localStorage.removeItem("CJU_TEMP_SESSION_KEY");
            const input = nativePrompt("🔑 Vui lòng đăng nhập Key kích hoạt để sử dụng CJU HIVE Auto:\n(Lưu ý: Mỗi Key chỉ dùng cho 1 trình duyệt)");
            if (input && input.trim() !== "") {
                activeKey = input.trim();
                sessionStorage.setItem("CJU_SESSION_ALIVE", "true");
                localStorage.setItem("CJU_TEMP_SESSION_KEY", activeKey);
            } else {
                return;
            }
        } else {
            activeKey = savedKey;
        }
    } else {
        activeKey = localStorage.getItem("CJU_TEMP_SESSION_KEY") || "";
    }

    if (!activeKey) return;

    function runRemoteTool(codeText) {
        pageWin.__CJU_AUTO_LOADED__ = false;

        try {
            const s = document.createElement('script');
            s.textContent = codeText;
            (document.head || document.documentElement).appendChild(s);
            s.remove();
            return;
        } catch (e) {
            console.error('[CJU] Lỗi script tag:', e);
        }

        try {
            if (typeof GM_addElement === 'function') {
                const el = GM_addElement('script', { textContent: codeText });
                if (el) el.remove();
                return;
            }
        } catch (e) {}

        try {
            const fn = new Function(codeText);
            fn();
        } catch (e) {
            console.error('[CJU] Lỗi Function:', e);
        }
    }

    function handleResponse(status, responseText) {
        if (status === 200) {
            if (responseText.includes("__CJU_AUTO_LOADED__")) {
                console.log('[CJU] ✅ Key hợp lệ, chạy code Auto');
                runRemoteTool(responseText);
            } else if (isMainPage && window.top === window.self) {
                nativeAlert("❌ Lỗi: Server trả về code không hợp lệ");
            }
        } else if (isMainPage && window.top === window.self) {
            nativeAlert(responseText || "❌ Key không hợp lệ hoặc đã bị khóa!");
            sessionStorage.removeItem("CJU_SESSION_ALIVE");
            localStorage.removeItem("CJU_TEMP_SESSION_KEY");
        }
    }

    function handleError() {
        if (isMainPage && window.top === window.self) {
            nativeAlert("⚠️ Không thể kết nối tới Server Key!\nKiểm tra lại kết nối hoặc Cloudflare Worker.");
        }
    }

    const requestUrl = SERVER_URL + "?t=" + Date.now();
    const requestHeaders = {
        "x-license-key": activeKey,
        "x-device-id": deviceId
    };

    // Ưu tiên GM_xmlhttpRequest / GM.xmlHttpRequest, tự động chuyển sang fetch() nếu chạy trên Safari iOS thiếu API
    const gmXhr = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest :
                  (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest : null;

    if (gmXhr) {
        gmXhr({
            method: "GET",
            url: requestUrl,
            headers: requestHeaders,
            onload: function(res) {
                handleResponse(res.status, res.responseText);
            },
            onerror: handleError,
            ontimeout: handleError
        });
    } else {
        fetch(requestUrl, {
            method: "GET",
            headers: requestHeaders,
            cache: "no-store"
        })
        .then(async (res) => {
            const text = await res.text();
            handleResponse(res.status, text);
        })
        .catch(handleError);
    }
})();
