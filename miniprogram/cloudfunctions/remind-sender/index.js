// 订阅提醒的定时发送（每小时第 5 分）。
//
// 触发方式：本目录的 config.json 里配了 timer 触发器，上传云函数时一并生效。
//
// 流程：
//   1. 取 remind_at <= 现在 且 sent = false 的记录
//   2. 按 slug 取活动最新信息（slug 是派生字段，只能通过 events 云函数在窗口里找）
//   3. 用最新时间重算提醒时刻：改期到更晚 → 更新记录等下一轮；活动没了 / 已结束 → 标记跳过
//   4. 调 subscribeMessage.send 发送，成功或失败都置 sent = true —— **失败不重试**
//      （一次性订阅被拒收、额度用完，重试也不会变好，重试只会把队列堵住）
//
// 时区：库里存的是 +08:00 的 ISO 串，查询前要把「现在」也格式化成同一个形状，
// 否则用 UTC 的 Z 串去比较会整体错 8 小时。

const cloud = require("wx-server-sdk");

const schedule = require("./lib/schedule.js");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = "reminders";
const TEMPLATE_ID = process.env.SUBSCRIBE_TMPL_ID || "8u57MzburW1sXnbqpEO0t8WMfTmlEmXo6Wj9GjKBntM";
const PAGE = "pages/detail/detail";
const BATCH = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { clipThing, shanghaiDayOf, shanghaiIso, shiftDays } = schedule;

/** 模板字段：date3 只能是单个日期，不能是区间 */
function buildData(item, event) {
  const anchorIso = item.anchor_kind === "end" ? event.end_time || event.start_time : event.start_time;
  const [year, month, day] = shanghaiDayOf(anchorIso).split("-");
  return {
    thing2: { value: clipThing(event.title) },
    date3: { value: year ? `${year}年${Number(month)}月${Number(day)}日` : "" },
    thing4: { value: item.anchor_kind === "end" ? "展览即将闭展，别错过" : "活动就要开始了，别错过" },
  };
}

async function markSent(id, patch) {
  await db.collection(COLLECTION).doc(id).update({ data: { sent: true, ...patch } });
}

exports.main = async () => {
  const now = Date.now();
  const nowIso = shanghaiIso(now);
  const today = shanghaiDayOf(now);

  let pending = [];
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ sent: false, remind_at: _.lte(nowIso) })
      .limit(BATCH)
      .get();
    pending = res.data || [];
  } catch (error) {
    // 集合还不存在（没人订阅过）不算错误
    if (error && /collection not exists/i.test(error.errMsg || error.message || "")) return { ok: true, checked: 0 };
    throw error;
  }

  const summary = { checked: pending.length, sent: 0, rescheduled: 0, skipped: 0, failed: 0 };

  for (const item of pending) {
    try {
      const got = await cloud.callFunction({ name: "events", data: { action: "get", slug: item.slug || "" } });
      const event = got && got.result && got.result.event;

      // 活动被清理或 slug 变了 → 不再发提醒
      if (!event) {
        await markSent(item._id, { skip_reason: "activity-gone" });
        summary.skipped += 1;
        continue;
      }

      const anchorIso = item.anchor_kind === "end" ? event.end_time || event.start_time : event.start_time;
      const anchorDay = shanghaiDayOf(anchorIso);
      const leadDays = item.lead_days === 3 ? 3 : 1;
      const nextAt = shiftDays(anchorDay, -leadDays);

      if (!nextAt) {
        await markSent(item._id, { skip_reason: "no-anchor" });
        summary.skipped += 1;
        continue;
      }

      // 活动改期到更晚：更新记录，等下一个整点再判
      if (new Date(nextAt).getTime() > now) {
        await db.collection(COLLECTION).doc(item._id).update({
          data: {
            remind_at: nextAt,
            title: String(event.title || "").slice(0, 200),
            start_time: event.start_time || null,
            end_time: event.end_time || null,
            rescheduled_at: db.serverDate(),
          },
        });
        summary.rescheduled += 1;
        continue;
      }

      // 活动已经结束（闭展日早于今天）
      if (shanghaiDayOf(event.end_time || event.start_time) < today) {
        await markSent(item._id, { skip_reason: "ended" });
        summary.skipped += 1;
        continue;
      }

      await cloud.openapi.subscribeMessage.send({
        touser: item.openid,
        templateId: TEMPLATE_ID,
        page: `${PAGE}?slug=${item.slug || ""}`,
        miniprogramState: "formal",
        data: buildData(item, event),
      });
      await markSent(item._id, { sent_at: db.serverDate() });
      summary.sent += 1;
    } catch (error) {
      // 失败不重试：记录原因，避免同一条每小时重试一次把队列堵住
      summary.failed += 1;
      const reason = `${error?.errCode || ""} ${error?.errMsg || error?.message || error}`.trim().slice(0, 200);
      await markSent(item._id, { error: reason }).catch(() => {});
      console.warn("[remind-sender] 发送失败", item.slug, reason);
    }
    // 订阅消息接口有 QPS 限制，串行 + 60ms 间隔足够稳
    await sleep(60);
  }

  console.log("[remind-sender]", JSON.stringify(summary));
  return { ok: true, ...summary };
};
