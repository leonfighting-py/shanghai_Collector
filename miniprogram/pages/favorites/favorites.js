const favorites = require("../../utils/favorites.js");

Page({
  data: {
    events: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    // 收藏时冗余存储了完整事件对象，可离线渲染
    const list = favorites
      .getFavorites()
      .map((item) => item.event)
      .filter((event) => event && event.title);
    this.setData({ events: list });
  },

  onFavoriteChange() {
    this.refresh();
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  },
});
