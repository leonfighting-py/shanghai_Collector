const config = require("./config.js");

// 云函数失败后重试一次：读操作幂等，冷启动超时 / 跨境查库抖动都属于"再打一次就好"的类型。
// 与云托管版不同，这里没有 callContainer 的 15s 硬上限，但前端仍要限制次数，不能无限等。
const RETRY_MS = 1500;
const MAX_ATTEMPTS = 2;

// 统一封装后端调用：走微信云开发的云函数，无需配置服务器域名、无需备案
function callApi(params = {}, attempt = 1) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !config.CLOUD_DEV_ENV) {
      reject(new Error("请先在 miniprogram/utils/config.js 中配置云开发环境 ID（CLOUD_DEV_ENV）"));
      return;
    }
    wx.cloud.callFunction({
      name: config.FUNCTION_NAME,
      data: params,
      success(res) {
        const result = (res && res.result) || {};
        // 结果摘要打到控制台：排障时能区分「函数跑起来了但业务报错」和「函数根本没跑」
        console.log(
          "[api] callFunction",
          config.FUNCTION_NAME,
          "->",
          result.error ? `error: ${result.error}` : `${result.count} 条`,
        );

        if (result.error) {
          // 400 是参数不合法（可以把原因露出来），500 只给一句人话，细节留在日志
          const error = new Error(result.statusCode === 400 ? result.error : "服务暂时不可用");
          error.statusCode = result.statusCode || 500;
          error.detail = String(result.error);
          reject(error);
          return;
        }
        resolve(result);
      },
      fail(err) {
        const raw = err && err.errMsg ? String(err.errMsg) : "";

        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[api] 云函数调用失败，${RETRY_MS}ms 后重试：`, raw);
          setTimeout(() => {
            callApi(params, attempt + 1).then(resolve, reject);
          }, RETRY_MS);
          return;
        }

        const error = new Error("服务暂时不可用，请稍后重试");
        error.errCode = err && err.errCode;
        // 原始报错留着，页面的排查期 detail 区还能看到（线上可关掉）
        error.detail = raw;
        reject(error);
      },
    });
  });
}

// 与 cloudfunctions/events 的入参对齐：week / category / search
function fetchEvents({ week, category, search } = {}) {
  const data = {};
  if (week) data.week = week;
  if (category) data.category = category;
  if (search) data.search = search;
  return callApi(data);
}

module.exports = { fetchEvents };
