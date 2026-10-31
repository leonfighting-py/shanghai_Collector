const config = require("./utils/config.js");

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库版本过低，无法使用云托管能力，请升级微信");
      return;
    }
    // 2026-10-31 起主读路径是云开发的云函数（cloudfunctions/events），
    // 所以这里必须传**云开发**环境 ID。注意别把云托管环境 ID 填进来：
    // 云开发环境与云托管环境是两套体系，填错会让云能力初始化失败。
    wx.cloud.init({ env: config.CLOUD_DEV_ENV, traceUser: true });
    console.log("[cloud] init done; 云开发 env =", config.CLOUD_DEV_ENV, "function =", config.FUNCTION_NAME);
  },
});
