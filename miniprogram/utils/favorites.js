const format = require("./format.js");

const STORAGE_KEY = "favorite_events_v1";

// 接口 DTO 不含 id，用 标题+上海日期+场馆 组合作为稳定标识（与后端 dedupe_key 同思路）
function eventIdOf(event) {
  return `${event.title}|${format.toShanghaiDate(event.start_time)}|${event.venue}`;
}

function getFavorites() {
  return wx.getStorageSync(STORAGE_KEY) || [];
}

function isFavorite(event) {
  const id = eventIdOf(event);
  return getFavorites().some((item) => item.id === id);
}

// 返回切换后的状态：true = 已收藏
function toggleFavorite(event) {
  const id = eventIdOf(event);
  const list = getFavorites();
  const index = list.findIndex((item) => item.id === id);
  let favorited;
  if (index >= 0) {
    list.splice(index, 1);
    favorited = false;
  } else {
    // 收藏时冗余存储完整事件，收藏页可离线渲染
    list.unshift({ id, savedAt: Date.now(), event });
    favorited = true;
  }
  wx.setStorageSync(STORAGE_KEY, list);
  return favorited;
}

module.exports = { eventIdOf, getFavorites, isFavorite, toggleFavorite };
