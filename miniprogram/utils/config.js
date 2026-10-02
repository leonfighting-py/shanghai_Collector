// 微信云托管环境配置：部署后填写，否则小程序无法发起请求
module.exports = {
  // 云托管环境 ID：云托管控制台右上角「环境下拉」里能直接看到，形如 "prod-8g0xxxxxxxxx"
  // （不是在小程序后台找，微信云托管是独立控制台 cloud.weixin.qq.com）
  CLOUD_ENV: "prod-d2gcdfycq884b1e6b",
  // 云托管服务名（创建服务时指定，与部署的服务名保持一致）
  SERVICE: "events-api",
  // 首页分批渲染条数（接口返回 14 天全量，客户端按批上屏提升首屏速度）
  PAGE_SIZE: 20,
};
