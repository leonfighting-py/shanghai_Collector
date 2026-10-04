const config = require("./config.js");

// 冷启动重试间隔：云托管实例缩容到 0 后，第一个请求要等实例拉起，
// 超过 callContainer 的 15s 上限就会抛 102002（官方定义为「请求超时」）。
// 第一次请求其实已经触发了实例启动，稍等再打一次通常就命中热实例，所以自动重试一次，
// 而不是把系统级报错直接甩到页面上。
const COLD_START_RETRY_MS = 1500;
const MAX_ATTEMPTS = 2;

// 统一封装云托管调用：走微信私有协议，无需配置服务器域名、无需备案
function callApi(path, method = "GET", data = undefined, attempt = 1) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !config.CLOUD_ENV) {
      reject(new Error("请先在 miniprogram/utils/config.js 中配置云托管环境 ID（CLOUD_ENV）"));
      return;
    }
    wx.cloud.callContainer({
      config: { env: config.CLOUD_ENV },
      path,
      method,
      data,
      header: {
        "X-WX-SERVICE": config.SERVICE,
        "content-type": "application/json",
      },
      success(res) {
        // 把原始响应打到控制台：非 2xx 时响应体是定位问题的关键证据
        // （Express 兜底 404 返回 HTML，云托管兜底 404 返回 JSON，一眼可分）
        console.log("[api]", method, path, "->", res.statusCode, res.data);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        let detail = "";
        if (typeof res.data === "string") {
          detail = res.data.slice(0, 200);
        } else if (res.data) {
          try {
            detail = JSON.stringify(res.data).slice(0, 200);
          } catch (e) {
            detail = String(res.data);
          }
        }

        const error = new Error(`服务返回 ${res.statusCode}`);
        error.statusCode = res.statusCode;
        error.body = res.data;
        error.detail = detail;
        reject(error);
      },
      fail(err) {
        const raw = err && err.errMsg ? String(err.errMsg) : "";
        // 102002 = 请求超时。99% 是冷启动：实例从 0 拉起超过 15s。
        // 根治在控制台（服务设置 → 实例副本数最小值设为 1），这里只是兜底。
        const coldStart = /102002/.test(raw) || /timeout/i.test(raw);

        if (coldStart && attempt < MAX_ATTEMPTS) {
          console.warn(`[api] 疑似冷启动超时，${COLD_START_RETRY_MS}ms 后自动重试：`, raw);
          setTimeout(() => {
            callApi(path, method, data, attempt + 1).then(resolve, reject);
          }, COLD_START_RETRY_MS);
          return;
        }

        const error = new Error(coldStart ? "服务正在启动，请稍后重试" : raw || "网络请求失败");
        error.errCode = err && err.errCode;
        error.coldStart = coldStart;
        // 原始报错留着，页面的排查期 detail 区还能看到（线上可关掉）
        error.detail = raw;
        reject(error);
      },
    });
  });
}

// 与 cloudrun/server.js 的 /api/events 对齐：week / category / search
function fetchEvents({ week, category, search } = {}) {
  const params = [];
  if (week) params.push(`week=${encodeURIComponent(week)}`);
  if (category) params.push(`category=${encodeURIComponent(category)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return callApi(`/api/events${query}`);
}

module.exports = { fetchEvents };
