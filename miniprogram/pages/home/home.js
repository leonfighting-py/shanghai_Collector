const api = require("../../utils/api.js");
const config = require("../../utils/config.js");
const sort = require("../../utils/sort.js");

const CATEGORIES = ["全部", "演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"];
const SORT_MODES = [
  { key: "recommended", label: "推荐" },
  { key: "latest", label: "最新" },
];

Page({
  data: {
    categories: CATEGORIES,
    sortModes: SORT_MODES,
    activeCategory: "全部",
    sortMode: "recommended",
    visibleEvents: [],
    totalCount: 0,
    loading: true,
    errorMsg: "",
    errorDetail: "",
    searchKeyword: "",
  },

  // 接口一次返回 14 天窗口全量，客户端做筛选/排序/分批上屏
  rawEvents: [],
  allEvents: [],
  visibleCount: 0,

  onLoad(options) {
    // 从朋友圈 / 会话分享链接进来时带上关键词，落地即还原筛选结果
    const shared = options && options.search ? String(options.search) : "";
    if (shared) this.setData({ searchKeyword: shared });

    // 开放分享入口（含朋友圈）。部分基础库不支持 menus 参数，失败静默忽略即可
    if (wx.showShareMenu) {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"],
        fail: () => {},
      });
    }

    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.renderMore();
  },

  load() {
    this.setData({ loading: true, errorMsg: "", errorDetail: "" });
    // 分类不在服务端过滤：一次拿全量，切分类/切排序都在本地重排，零延迟。
    // 只有搜索需要走服务端（要匹配 summary，本地拿不到全文）。
    const params = {};
    const keyword = this.data.searchKeyword.trim();
    if (keyword) params.search = keyword;

    return api
      .fetchEvents(params)
      .then((res) => {
        this.rawEvents = res.events || [];
        this.setData({ loading: false });
        this.applySort();
      })
      .catch((err) => {
        this.setData({
          loading: false,
          errorMsg: err.message || "加载失败，请重试",
          // 排查期把服务端返回体一并显示出来（线上可随时删掉这一行）
          errorDetail: err.detail ? String(err.detail).slice(0, 160) : "",
        });
      });
  },

  // 本地筛选 + 排序，并把分批上屏的游标重置回第一页
  applySort() {
    const category = this.data.activeCategory === "全部" ? "" : this.data.activeCategory;
    const pool = category ? this.rawEvents.filter((event) => event.category === category) : this.rawEvents;
    this.allEvents = sort.sortForCategory(pool, category, { mode: this.data.sortMode });
    this.visibleCount = 0;
    this.setData({ totalCount: this.allEvents.length });
    this.renderMore();
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
    this.applySort();
  },

  onSelectSortMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.sortMode) return;
    this.setData({ sortMode: mode });
    this.applySort();
    // 换排序等于换一套首屏，滚回顶部避免"点了没反应"的错觉
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
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

  // 分享当前筛选结果，而不是干巴巴一个首页
  onShareAppMessage() {
    const category = this.data.activeCategory === "全部" ? "" : `【${this.data.activeCategory}】`;
    const keyword = this.data.searchKeyword.trim();
    return {
      title: `${category}上海未来两周活动${keyword ? `｜${keyword}` : ""}`,
      path: "/pages/home/home",
    };
  },

  onShareTimeline() {
    const keyword = this.data.searchKeyword.trim();
    return {
      title: keyword ? `上海未来两周活动｜${keyword}` : "上海未来两周活动",
      query: keyword ? `search=${encodeURIComponent(keyword)}` : "",
    };
  },
});
