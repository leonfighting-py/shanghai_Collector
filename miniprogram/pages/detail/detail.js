const agenda = require("../../utils/agenda.js");
const config = require("../../utils/config.js");
const imageUrl = require("../../utils/image-url.js");
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

  onLoad(options) {
    // 订阅消息 / 分享卡片进来时只有 slug（活动对象传不过来），按 slug 拉单条
    if (options && options.slug) {
      this.loadBySlug(options.slug);
      return;
    }
    // 列表页 / 收藏页通过 eventChannel 传入完整事件对象
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && channel.on) {
      channel.on("event", (event) => this.applyEvent(event));
    }
  },

  loadBySlug(slug) {
    wx.showLoading({ title: "加载中", mask: true });
    wx.cloud.callFunction({
      name: config.FUNCTION_NAME,
      data: { action: "get", slug },
      success: (res) => {
        const result = (res && res.result) || {};
        if (result.event) {
          this.applyEvent(result.event);
        } else {
          this.showGone();
        }
      },
      fail: (err) => {
        console.warn("[detail] 按 slug 拉取失败", err);
        this.showGone();
      },
      complete: () => wx.hideLoading(),
    });
  },

  // 活动已结束或被清理：不留白页，提示后回首页
  showGone() {
    wx.showToast({ title: "活动已结束或已下线", icon: "none", duration: 2000 });
    setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 1600);
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
      const plan = accepted ? reminders.planFor(event) : null;
      const note = !accepted
        ? ""
        : plan
          ? reminders.describeRemind(plan.remindAt)
          : "这场活动已经开始，不再提醒";
      this.setData({ favorited, remindNote: note });
      if (plan) subscribe.setReminder(event);
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
      // 带 slug：对方点开直达这场活动，而不是首页
      path: event.slug ? `/pages/detail/detail?slug=${event.slug}` : "/pages/home/home",
      // 缩到宽 500：卡片按 5:4 裁，给太大的图只是白花流量
      imageUrl: imageUrl.optimizedImageUrl(event.image_url, { width: 500 }),
    };
  },
});
