// 报名链接处理：
// 个人主体小程序无法使用 web-view（且 web-view 也仅能打开自有业务域名），
// 第三方报名页分两种情况：
//  1. 平台有小程序（大麦/活动行/秀动）→ wx.navigateToMiniProgram 直达
//  2. 其余 → 复制链接，引导用户到浏览器打开
//
// appId 获取方式：微信打开对方小程序 → 右上角胶囊 → 「关于」可看到；
// 或从对方小程序的分享链接参数中提取。填写后自动启用直达跳转。
const REGISTRY = [
  { name: "大麦", pattern: /damai\.(cn|com)/i, appId: "" },
  { name: "活动行", pattern: /huodongxing\.com/i, appId: "" },
  { name: "秀动", pattern: /showstart\.com/i, appId: "" },
];

function resolveRegistration(url) {
  const entry = REGISTRY.find((item) => item.appId && item.pattern.test(url || ""));
  if (entry) return { type: "miniprogram", name: entry.name, appId: entry.appId };
  return { type: "copy" };
}

function copySignupUrl(url) {
  wx.setClipboardData({
    data: url,
    success: () => {
      wx.showModal({
        title: "报名链接已复制",
        content: "请打开手机浏览器粘贴访问，完成报名。",
        showCancel: false,
      });
    },
  });
}

function openRegistration(url) {
  if (!/^https?:\/\//i.test(url || "")) {
    wx.showToast({ title: "暂无报名链接", icon: "none" });
    return;
  }
  const target = resolveRegistration(url);
  if (target.type === "miniprogram") {
    wx.navigateToMiniProgram({
      appId: target.appId,
      fail: () => copySignupUrl(url),
    });
    return;
  }
  copySignupUrl(url);
}

module.exports = { resolveRegistration, openRegistration };
