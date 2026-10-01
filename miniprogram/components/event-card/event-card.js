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
    dateBadge: "",
    favorited: false,
    imageFailed: false,
  },
  observers: {
    event(event) {
      if (!event || !event.title) return;
      this.setData({
        period: format.eventPeriod(event),
        dateBadge: format.relativeLabel(event.start_time),
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
