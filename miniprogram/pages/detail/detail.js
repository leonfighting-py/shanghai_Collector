const agenda = require("../../utils/agenda.js");
const favorites = require("../../utils/favorites.js");
const format = require("../../utils/format.js");
const registration = require("../../utils/registration.js");
const reminders = require("../../utils/reminders.js");
const subscribe = require("../../utils/subscribe.js");

Page({
  data: {
    event: null,
    period: "",
    periodNote: "",
    favorited: false,
    imageFailed: false,
    sourceList: [],
    targetPlatform: "",
    // 收藏后那行提醒说明；空字符串表示不显示
    remindNote: "",
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
    const event = this.data.event;
    if (!event) return;

    // 取消收藏：本地先切，再异步删掉提醒记录（删失败也不影响收藏状态）
    if (this.data.favorited) {
      this.setData({ favorited: favorites.toggleFavorite(event), remindNote: "" });
      subscribe.removeReminder(event);
      return;
    }

    // 收藏：先弹订阅授权（必须在点击的同步栈里），再落收藏与提醒
    subscribe.requestSubscribe().then((accepted) => {
      const favorited = favorites.toggleFavorite(event);
      const remindAt = accepted ? reminders.remindAtOf(event) : null;
      const note = !accepted
        ? ""
        : remindAt
          ? reminders.describeRemind(remindAt)
          : "这场活动已经开始，不再提醒";
      this.setData({ favorited, remindNote: note });
      if (accepted && remindAt) subscribe.setReminder(event, remindAt);
    });
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
