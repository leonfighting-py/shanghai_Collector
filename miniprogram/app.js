const config = require("./utils/config.js");

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库版本过低，无法使用云托管能力，请升级微信");
      return;
    }
    if (config.CLOUD_ENV) {
      wx.cloud.init({ env: config.CLOUD_ENV, traceUser: true });
    }
  },
});
