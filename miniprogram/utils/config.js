// 微信云开发环境配置：小程序的主读路径（2026-10-31 起）
module.exports = {
  // 云开发环境 ID：在开发者工具「云开发」控制台左上角的环境下拉里看
  //
  // 2026-10-31 起小程序改走这里的云函数（cloudfunctions/events）。
  // 该环境是「小程序成长计划」二期赠送的个人版环境，到期 2027-04-30。
  // ⚠️ 这是云开发环境，与下面的云托管环境是两套体系，ID 不能互换。
  CLOUD_DEV_ENV: "cloud1-d2gf2labp2a33b92b",
  // 云函数名，必须与 cloudfunctions/ 下的目录名逐字一致
  FUNCTION_NAME: "events",

  // ---------- 以下为云托管（旧读路径，保留回滚用）----------
  // 回滚方式：把 utils/api.js 里的 callFunction 换回 callContainer，并把下面两行填进
  // wx.cloud.callContainer 的 config.env / X-WX-SERVICE。
  // 云托管环境 ID：云托管控制台右上角「环境下拉」里能直接看到
  // 2026-10-03：环境必须属于本项目的小程序 wx9fbcd7833ef0590c。
  CLOUD_ENV: "events-api-d6groy01wc45330f3",
  // 云托管服务名（创建服务时指定，与部署的服务名保持一致）
  SERVICE: "events-api",
  // 首页分批渲染条数（接口返回 14 天全量，客户端按批上屏提升首屏速度）
  PAGE_SIZE: 20,
};
