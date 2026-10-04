const agenda = require("../../utils/agenda.js");
const api = require("../../utils/api.js");
const format = require("../../utils/format.js");

const CATEGORIES = [
  { key: "", label: "全部" },
  { key: "演出音乐", label: "演出" },
  { key: "展览", label: "展览" },
  { key: "线下活动", label: "活动" },
  { key: "高校讲座", label: "讲座" },
  { key: "AI聚会", label: "AI" },
];
const SHORT_CATEGORY = {};
CATEGORIES.forEach((item) => {
  if (item.key) SHORT_CATEGORY[item.key] = item.label;
});

// 每天默认露出的「当天开始 / 结束」行数，其余折叠
const DAY_ROW_LIMIT = 5;
// 「正在进行」海报栏最多放几张
const RAIL_LIMIT = 10;
// 吸顶筛选条（类目 Tab + 日期条）的高度，单位 px，用于点日期跳转时留出偏移
const STICKY_HEIGHT = 116;

Page({
  data: {
    categories: CATEGORIES,
    activeCategory: "",
    searchKeyword: "",
    loading: true,
    errorMsg: "",
    errorDetail: "",

    // 自定义导航：首屏是出血封面，下滑越过封面后才显示实色标题栏
    statusBarHeight: 20,
    navHeight: 64,
    navSolid: false,

    stats: { upcoming: 0, ongoing: 0, venues: 0 },
    ongoing: [],
    ongoingCount: 0,
    chips: [],
    days: [],
    // 日期条上高亮的那一天：跟着滚动位置走，而不是固定在今天
    activeDate: "",
    // 「展期中」完整清单的底部面板
    drawer: { open: false, day: "", weekday: "", items: [] },
  },

  // 接口一次返回 14 天窗口全量；setData 里只放渲染要用的精简字段，
  // 完整事件对象留在这里按下标取（进详情页时用），避免 setData 体积过大
  rawEvents: [],
  pool: [],
  // 每天折叠起来的展期中活动，展开时才 setData
  foldedByDate: {},
  // 每个日期分组距页面顶部的距离（px），滚动时用来判断当前滚到哪一天
  dayTops: [],

  onLoad(options) {
    // 从朋友圈 / 会话分享链接进来时带上关键词，落地即还原筛选结果
    const shared = options && options.search ? String(options.search) : "";
    if (shared) this.setData({ searchKeyword: shared });

    this.measureNav();

    // 开放分享入口（含朋友圈）。部分基础库不支持 menus 参数，失败静默忽略即可
    if (wx.showShareMenu) {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"],
        fail: () => {},
      });
    }

    this.load();
  },

  // 标题栏高度 = 状态栏 + 胶囊按钮上下留白，跟着机型走（刘海屏 / 灵动岛各不相同）
  measureNav() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = info.statusBarHeight || 20;
      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      const navHeight = menu && menu.bottom ? menu.bottom + (menu.top - statusBarHeight) : statusBarHeight + 44;
      this.setData({ statusBarHeight, navHeight });
    } catch (error) {
      // 取不到就用默认值，不影响功能
    }
  },

  onPageScroll(event) {
    // 封面高 744rpx，滚过大半后切到实色标题栏。只在状态翻转时 setData
    const threshold = (wx.getWindowInfo ? wx.getWindowInfo().windowWidth : 375) * 0.75;
    const navSolid = event.scrollTop > threshold;
    this.syncActiveDate(event.scrollTop);
    if (navSolid === this.data.navSolid) return;
    this.setData({ navSolid });
    // 胶囊按钮和状态栏文字的颜色：压在封面上用白色，实色标题栏上跟随深浅色
    const dark = (wx.getAppBaseInfo ? wx.getAppBaseInfo().theme : "") === "dark";
    wx.setNavigationBarColor({
      frontColor: navSolid && !dark ? "#000000" : "#ffffff",
      backgroundColor: "#000000",
      fail: () => {},
    });
  },

  // 量出每个日期分组的位置。列表内容变化（切类目、展开折叠）后都要重量
  measureDays() {
    wx.createSelectorQuery()
      .selectAll(".day")
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec((res) => {
        const rects = (res && res[0]) || [];
        const scrollTop = res && res[1] ? res[1].scrollTop : 0;
        this.dayTops = rects.map((rect) => ({ date: rect.id.replace("day-", ""), top: rect.top + scrollTop }));
        this.syncActiveDate(scrollTop);
      });
  },

  // 找出「已经滚到吸顶筛选条下面」的最后一天。只在日期变化时 setData
  syncActiveDate(scrollTop) {
    if (!this.dayTops.length) return;
    const line = scrollTop + this.data.navHeight + STICKY_HEIGHT + 40;
    let current = this.dayTops[0].date;
    for (let index = 0; index < this.dayTops.length; index += 1) {
      if (this.dayTops[index].top > line) break;
      current = this.dayTops[index].date;
    }
    if (current !== this.data.activeDate) this.setData({ activeDate: current });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, errorMsg: "", errorDetail: "" });
    // 分类不在服务端过滤：一次拿全量，切分类在本地重算，零延迟。
    // 只有搜索需要走服务端（要匹配 summary，本地拿不到全文）。
    const params = {};
    const keyword = this.data.searchKeyword.trim();
    if (keyword) params.search = keyword;

    return api
      .fetchEvents(params)
      .then((res) => {
        this.rawEvents = res.events || [];
        this.setData({ loading: false });
        this.rebuild();
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

  // 按当前类目重算整页：统计数字、「正在进行」海报栏、日期条、日程表
  rebuild() {
    const today = format.toShanghaiDate(new Date());
    const category = this.data.activeCategory;
    this.pool = category ? this.rawEvents.filter((event) => event.category === category) : this.rawEvents;
    const indexOf = new Map(this.pool.map((event, index) => [event, index]));

    const split = agenda.splitByToday(this.pool, today);
    const venues = {};
    this.pool.forEach((event) => {
      venues[event.venue] = true;
    });

    const built = agenda.buildAgenda(this.pool, today);
    this.foldedByDate = {};

    const days = built
      .filter((day) => day.rows.length > 0)
      .map((day) => {
        this.foldedByDate[day.date] = day.folded;
        const own = day.rows.filter((row) => row.kind !== "run").length;
        return {
          date: day.date,
          day: day.day,
          weekday: day.weekday,
          isToday: day.isToday,
          meta: day.startCount ? `${day.startCount} 场开始` : `${day.runningCount} 场展期中`,
          rows: day.rows.map((row) => {
            const labels = agenda.rowLabels(row.event, row.kind, day.date);
            return {
              id: indexOf.get(row.event),
              kind: row.kind,
              title: row.event.title,
              venue: row.event.venue,
              category: SHORT_CATEGORY[row.event.category] || row.event.category,
              image: row.event.image_url || "",
              time: labels.time,
              range: labels.range,
              span: labels.span,
            };
          }),
          hiddenCount: Math.max(0, own - DAY_ROW_LIMIT),
          showAll: false,
          foldedCount: day.folded.length,
        };
      });

    this.setData({
      stats: { upcoming: split.upcoming.length, ongoing: split.ongoing.length, venues: Object.keys(venues).length },
      ongoingCount: split.ongoing.length,
      ongoing: split.ongoing.slice(0, RAIL_LIMIT).map((event) => ({
        id: indexOf.get(event),
        title: event.title,
        venue: event.venue,
        category: SHORT_CATEGORY[event.category] || event.category,
        image: event.image_url || "",
        until: agenda.dotDate(agenda.endDay(event)),
      })),
      chips: built.map((day) => ({
        date: day.date,
        day: day.day,
        weekday: day.weekday,
        isToday: day.isToday,
        isWeekend: day.isWeekend,
        empty: day.rows.length === 0,
      })),
      days,
      activeDate: days.length ? days[0].date : "",
    }, () => this.measureDays());
  },

  onSelectCategory(event) {
    const category = event.currentTarget.dataset.category;
    if (category === this.data.activeCategory) return;
    this.setData({ activeCategory: category });
    this.rebuild();
  },

  // 点日期条 → 滚到那一天。偏移量要扣掉固定标题栏和吸顶筛选条的高度
  onJumpDay(event) {
    const { date, empty } = event.currentTarget.dataset;
    if (empty) return;
    wx.pageScrollTo({
      selector: `#day-${date}`,
      offsetTop: -(this.data.navHeight + STICKY_HEIGHT),
      duration: 250,
    });
  },

  onToggleDayRows(event) {
    const index = event.currentTarget.dataset.index;
    this.setData({ [`days[${index}].showAll`]: !this.data.days[index].showAll }, () => this.measureDays());
  },

  // 「展期中 · 另有 N 场」在底部面板里看。这批数据量大，打开时才 setData
  onOpenDrawer(event) {
    const day = this.data.days[event.currentTarget.dataset.index];
    const items = (this.foldedByDate[day.date] || []).map((item) => {
      const labels = agenda.rowLabels(item, "run", day.date);
      return {
        id: this.pool.indexOf(item),
        title: item.title,
        venue: item.venue,
        category: SHORT_CATEGORY[item.category] || item.category,
        image: item.image_url || "",
        time: labels.time,
        range: labels.range,
      };
    });
    this.setData({
      drawer: { open: true, day: day.day, weekday: day.weekday + (day.isToday ? " · 今天" : ""), items },
    });
  },

  onCloseDrawer() {
    this.setData({ drawer: { open: false, day: "", weekday: "", items: [] } });
  },

  // 占位：吞掉面板上的点击和遮罩上的滑动，避免穿透到下面的页面
  noop() {},

  onOpenEvent(event) {
    const target = this.pool[event.currentTarget.dataset.id];
    if (!target) return;
    wx.navigateTo({
      url: "/pages/detail/detail",
      success: (res) => res.eventChannel.emit("event", target),
    });
  },

  onPosterError(event) {
    this.setData({ [`ongoing[${event.currentTarget.dataset.index}].image`]: "" });
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
    const category = this.data.activeCategory ? `【${this.data.activeCategory}】` : "";
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
