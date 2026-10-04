const agenda = require("../../utils/agenda.js");
const favorites = require("../../utils/favorites.js");

const SHORT_CATEGORY = { 演出音乐: "演出", 展览: "展览", 线下活动: "活动", 高校讲座: "讲座", AI聚会: "AI" };

Page({
  data: {
    rows: [],
  },

  // 完整事件对象留在这里按下标取（进详情页时用），setData 只放渲染字段
  events: [],

  onShow() {
    this.refresh();
  },

  refresh() {
    // 收藏时冗余存储了完整事件对象，可离线渲染。按开始时间排，最近的在前
    this.events = favorites
      .getFavorites()
      .map((item) => item.event)
      .filter((event) => event && event.title)
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());

    this.setData({
      rows: this.events.map((event, index) => ({
        id: index,
        title: event.title,
        venue: event.venue,
        category: SHORT_CATEGORY[event.category] || event.category,
        image: event.image_url || "",
        time: agenda.dotDate(agenda.startDay(event)),
        range: agenda.rangeText(event),
      })),
    });
  },

  onOpenEvent(event) {
    const target = this.events[event.currentTarget.dataset.id];
    if (!target) return;
    wx.navigateTo({
      url: "/pages/detail/detail",
      success: (res) => res.eventChannel.emit("event", target),
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  },
});
