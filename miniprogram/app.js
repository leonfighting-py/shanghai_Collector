const config = require("./utils/config.js");

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库版本过低，无法使用云托管能力，请升级微信");
      return;
    }
    // 注意：不要给 init 传云托管环境 ID。
    // 云开发环境与云托管环境是两套体系，把云托管 ID 填进 init 会让云能力
    // 初始化失败，随后 callContainer 报 -601034「没有权限，请先开通云开发或者云托管」。
    // callContainer 自己带着 config.env，不依赖这里，所以这里留空即可。
    wx.cloud.init({ traceUser: true });
    console.log("[cloud] init done; 云托管 env =", config.CLOUD_ENV, "service =", config.SERVICE);
  },
});
