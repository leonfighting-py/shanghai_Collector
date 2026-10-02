const config = require("./config.js");

// 统一封装云托管调用：走微信私有协议，无需配置服务器域名、无需备案
function callApi(path, method = "GET", data = undefined) {
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
        reject(new Error(err.errMsg || "网络请求失败"));
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
