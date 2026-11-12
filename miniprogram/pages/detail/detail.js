const agenda = require("../../utils/agenda.js");
const favorites = require("../../utils/favorites.js");
const format = require("../../utils/format.js");
const registration = require("../../utils/registration.js");

Page({
  data: {
    event: null,
    period: "",
    periodNote: "",
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
    const multiDay = agenda.isMultiDay(event);
    this.setData({
      event,
      // 跨天活动突出「档期」：主行写区间和天数，副行写首日几点开始
      period: multiDay
        ? `${agenda.dotDate(agenda.startDay(event))} — ${agenda.dotDate(agenda.endDay(event))}（共 ${agenda.spanDays(event)} 天）`
        : format.eventPeriod(event),
      periodNote: multiDay ? `首日 ${format.eventDate(event.start_time)} ${format.eventTime(event.start_time)} 开始` : "",
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
      title: event.title ? `【${event.category}】${event.title}` : "上海城市生活雷达",
      path: "/pages/home/home",
      imageUrl: event.image_url || "",
    };
  },
});
