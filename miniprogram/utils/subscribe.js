// 订阅提醒的客户端封装：请求授权 + 调云函数写库/删库。
//
// 注意：requestSubscribeMessage 必须在用户点击的**同步调用栈**里发起，
// 所以这里不做任何 await/preflight —— 先弹授权，拿到结果再决定后续动作。

const config = require("./config.js");
const reminders = require("./reminders.js");

/**
 * 弹订阅授权框。用户点「允许」时模板项为 "accept"，拒绝是 "reject"，勾了「总是保持」也不影响。
 * @returns {Promise<boolean>} 是否同意
 */
function requestSubscribe() {
  return new Promise((resolve) => {
    if (!config.SUBSCRIBE_TMPL_ID) {
      // 没配模板 ID 时直接跳过，不影响收藏本身
      resolve(false);
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TMPL_ID],
      success: (res) => resolve(res && res[config.SUBSCRIBE_TMPL_ID] === "accept"),
      fail: (err) => {
        console.warn("[subscribe] 请求授权失败", err);
        resolve(false);
      },
    });
  });
}

function callFunction(data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: config.SUBSCRIBE_FUNCTION,
      data,
      success: (res) => {
        const result = (res && res.result) || {};
        if (!result.ok) console.warn("[subscribe] 云函数返回", result.error);
        resolve(result);
      },
      fail: (err) => {
        // 提醒是附加功能：写库失败不能影响收藏，只在控制台留痕
        console.warn("[subscribe] 调用云函数失败", err);
        resolve({ ok: false, error: String((err && err.errMsg) || err) });
      },
    });
  });
}

function setReminder(event, remindAt) {
  return callFunction({
    action: "set",
    key: reminders.keyOf(event),
    title: event.title,
    start_time: event.start_time,
    end_time: event.end_time || null,
    venue: event.venue,
    remind_at: remindAt,
  });
}

function removeReminder(event) {
  return callFunction({ action: "remove", key: reminders.keyOf(event) });
}

module.exports = { removeReminder, requestSubscribe, setReminder };
