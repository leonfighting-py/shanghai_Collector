const favorites = require("../../utils/favorites.js");
const format = require("../../utils/format.js");
const registration = require("../../utils/registration.js");

Page({
  data: {
    event: null,
    period: "",
    favorited: false,
    imageFailed: false,
    sourceList: [],
    targetPlatform: "",
  },

  onLoad() {
    // 列表页 / 收藏页通过 eventChannel 传入完整事件对象
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && channel.on) {
      channel.on("event", (event) => this.applyEvent(event));
    }
  },

  applyEvent(event) {
    if (!event || !event.title) return;
    const target = registration.resolveRegistration(event.signup_url);
    this.setData({
      event,
      period: format.eventPeriod(event),
      favorited: favorites.isFavorite(event),
      sourceList: Array.isArray(event.sources) ? event.sources : [],
      targetPlatform: target.type === "miniprogram" ? target.name : "",
    });
    wx.setNavigationBarTitle({ title: event.title });
  },

  onToggleFavorite() {
    if (!this.data.event) return;
    this.setData({ favorited: favorites.toggleFavorite(this.data.event) });
  },

  onSignup() {
    registration.openRegistration(this.data.event.signup_url);
  },

  // 源链接无法在小程序内打开，提供复制入口
  onCopySource(event) {
    const url = event.currentTarget.dataset.url;
    if (!/^https?:\/\//i.test(url || "")) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "success" }),
    });
  },

  onImageError() {
    this.setData({ imageFailed: true });
  },

  onShareAppMessage() {
    const event = this.data.event || {};
    return {
      title: event.title ? `【${event.category}】${event.title}` : "沪上双周活动",
      path: "/pages/home/home",
      imageUrl: event.image_url || "",
    };
  },
});
