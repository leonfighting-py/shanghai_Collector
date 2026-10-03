const favorites = require("../../utils/favorites.js");
const format = require("../../utils/format.js");

Component({
  options: { addGlobalClass: true },
  properties: {
    event: { type: Object, value: {} },
    // 列表卡片显示收藏星标；详情页头部由页面自己控制时传 false
    showFavorite: { type: Boolean, value: true },
  },
  data: {
    period: "",
    periodShort: "",
    dateBadge: "",
    favorited: false,
    imageFailed: false,
  },
  observers: {
    event(event) {
      if (!event || !event.title) return;
      this.setData({
        // 卡片用紧凑区间（"9.24–10.30"），详情页用完整区间（"9月24日 周四 19:30 至 10月30日…"）
        period: format.eventPeriod(event),
        periodShort: format.eventRangeShort(event),
        dateBadge: format.eventBadge(event),
        favorited: favorites.isFavorite(event),
        imageFailed: false,
      });
    },
  },
  methods: {
    onTap() {
      wx.navigateTo({
        url: "/pages/detail/detail",
        success: (res) => res.eventChannel.emit("event", this.data.event),
      });
    },
    onToggleFavorite() {
      if (!this.data.event || !this.data.event.title) return;
      const favorited = favorites.toggleFavorite(this.data.event);
      this.setData({ favorited });
      this.triggerEvent("favoritechange", { favorited });
    },
    // 部分源（如活动行）有防盗链，加载失败时隐藏占位，避免裂图
    onImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
