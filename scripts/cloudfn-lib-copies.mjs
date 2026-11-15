// 云函数上传时只带 miniprogram/cloudfunctions/events/ 目录，所以 src/lib 里被它用到的纯函数
// 必须复制一份进去。这份清单是**唯一真相**：同步脚本和 parity 测试都从这儿读，
// 免得两边各写一份然后漂移。
//
// 副本唯一允许的差异是 import 的扩展名（.js → .mjs：Node 里 .mjs 才按 ESM 解析）。
export const LIB_COPIES = [
  ["events.js", "events.mjs"],
  ["dedupe.js", "dedupe.mjs"],
  ["event-classify.js", "event-classify.mjs"],
  ["event-duration.js", "event-duration.mjs"],
  // event-slug.js 不能依赖 node:crypto（云函数与 Workers 都要能跑），自带 sha1
  ["event-slug.js", "event-slug.mjs"],
];

export function toMjs(source) {
  return source.replace(/from "\.\/([A-Za-z0-9_-]+)\.js"/g, 'from "./$1.mjs"');
}
