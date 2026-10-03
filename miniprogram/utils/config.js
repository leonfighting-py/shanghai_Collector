// 微信云托管环境配置：部署后填写，否则小程序无法发起请求
module.exports = {
  // 云托管环境 ID：云托管控制台右上角「环境下拉」里能直接看到，形如 "prod-8g0xxxxxxxxx"
  // （不是在小程序后台找，微信云托管是独立控制台 cloud.weixin.qq.com）
  //
  // 2026-10-03：环境必须属于本项目的小程序 wx9fbcd7833ef0590c。
  // 旧值 prod-d2gcdfycq884b1e6b 属于另一个小程序，会导致 callContainer 报
  // INVALID_HOST（无效主机名），已弃用。
  CLOUD_ENV: "events-api-d6groy01wc45330f3",
  // 云托管服务名（创建服务时指定，与部署的服务名保持一致）
  SERVICE: "events-api",
  // 首页分批渲染条数（接口返回 14 天全量，客户端按批上屏提升首屏速度）
  PAGE_SIZE: 20,
};
