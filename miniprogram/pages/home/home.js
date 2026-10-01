const api = require("../../utils/api.js");
const config = require("../../utils/config.js");
const sort = require("../../utils/sort.js");

const CATEGORIES = ["全部", "演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"];

Page({
  data: {
    categories: CATEGORIES,
    activeCategory: "全部",
    visibleEvents: [],
    totalCount: 0,
    loading: true,
    errorMsg: "",
    searchKeyword: "",
  },

  // 接口返回 14 天窗口全量，客户端分批上屏
  allEvents: [],
  visibleCount: 0,

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.renderMore();
  },

  load() {
    this.setData({ loading: true, errorMsg: "" });
    const params = {};
    if (this.data.activeCategory !== "全部") params.category = this.data.activeCategory;
    const keyword = this.data.searchKeyword.trim();
    if (keyword) params.search = keyword;

    return api
      .fetchEvents(params)
      .then((res) => {
        const category = this.data.activeCategory === "全部" ? "" : this.data.activeCategory;
        this.allEvents = sort.sortForCategory(res.events || [], category);
        this.visibleCount = 0;
        this.setData({ loading: false, totalCount: this.allEvents.length });
        this.renderMore();
      })
      .catch((err) => {
        this.setData({ loading: false, errorMsg: err.message || "加载失败，请重试" });
      });
  },

  renderMore() {
    const target = this.visibleCount + config.PAGE_SIZE;
    if (target >= this.allEvents.length) {
      if (this.visibleCount === this.allEvents.length) return;
      this.visibleCount = this.allEvents.length;
      this.setData({ visibleEvents: this.allEvents, totalCount: this.allEvents.length });
      return;
    }
    this.visibleCount = target;
    this.setData({ visibleEvents: this.allEvents.slice(0, target), totalCount: this.allEvents.length });
  },

  onSelectCategory(event) {
    const category = event.currentTarget.dataset.category;
    if (category === this.data.activeCategory) return;
    this.setData({ activeCategory: category });
    this.load();
  },

  onSearchInput(event) {
    this.setData({ searchKeyword: event.detail.value });
  },

  onSearchConfirm() {
    this.load();
  },

  onClearSearch() {
    if (!this.data.searchKeyword) return;
    this.setData({ searchKeyword: "" });
    this.load();
  },

  onRetry() {
    this.load();
  },
});
