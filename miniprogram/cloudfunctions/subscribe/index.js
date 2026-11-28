// 微信云开发云函数：订阅提醒的写入 / 删除。
//
// 为什么用云开发数据库而不是现有 Postgres：第 19 天发送要用
// cloud.openapi.subscribeMessage.send()，在云函数里调不需要自己维护 access_token。
//
// 集合 reminders 字段：
//   openid     发起订阅的用户
//   key        活动唯一键（标题|上海日期|场馆），与小程序收藏的 id 同构
//   title / start_time / end_time / venue   发送时拼模板字段用
//   remind_at  ISO 串，上海时间 10:00
//   sent       是否已发送（第 19 天的定时任务只看 false）
//   created_at 首次订阅时间
//
// 同一用户同一活动只存一条：先按 (openid, key) 查，有就更新。
// ⚠️ 建议在云开发控制台给 reminders 建复合索引 openid+key，否则 collection 大了以后查询会慢。

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = "reminders";
const COLLECTION_NOT_EXIST = -502005;

function isMissingCollection(error) {
  return Boolean(
    error &&
      (error.errCode === COLLECTION_NOT_EXIST || /collection not exists/i.test(error.errMsg || error.message || "")),
  );
}

/** 第一次写入时集合还不存在，建一下再重试。省得让用户去控制台手动建。 */
async function withCollection(run) {
  try {
    return await run();
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
    await db.createCollection(COLLECTION).catch(() => {});
    return run();
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: "no-openid" };

  const key = String(event.key || "").slice(0, 200);
  if (!key) return { ok: false, error: "no-key" };

  if (event.action === "remove") {
    const res = await withCollection(() => db.collection(COLLECTION).where({ openid: OPENID, key }).remove());
    return { ok: true, removed: res.stats ? res.stats.removed : 0 };
  }

  // 只接受未来时间，避免客户端把提醒排到过去（那种记录永远发不出去，只会占地方）
  const remindAt = String(event.remind_at || "");
  const at = new Date(remindAt).getTime();
  if (!remindAt || Number.isNaN(at) || at <= Date.now()) {
    return { ok: false, error: "bad-remind-at" };
  }

  const payload = {
    openid: OPENID,
    key,
    // slug 与 Web 的 URL 同一个值，第 19 天用它去查最新活动
    slug: String(event.slug || "").slice(0, 40),
    title: String(event.title || "").slice(0, 200),
    start_time: event.start_time || null,
    end_time: event.end_time || null,
    venue: String(event.venue || "").slice(0, 100),
    remind_at: remindAt,
    // 重算提醒时刻只需要这两个参数：锚在开始日还是闭展日、提前几天
    lead_days: Number(event.lead_days) === 3 ? 3 : 1,
    anchor_kind: event.anchor_kind === "end" ? "end" : "start",
    sent: false,
    updated_at: db.serverDate(),
  };

  const existing = await withCollection(() =>
    db.collection(COLLECTION).where({ openid: OPENID, key }).limit(1).get(),
  );

  if (existing.data.length > 0) {
    // 重新收藏同一场（可能改了时间）→ 覆盖，不新增
    await db.collection(COLLECTION).doc(existing.data[0]._id).update({ data: payload });
    return { ok: true, updated: true };
  }

  await db.collection(COLLECTION).add({ data: { ...payload, created_at: db.serverDate() } });
  return { ok: true, created: true };
};
