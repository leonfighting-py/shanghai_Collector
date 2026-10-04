// 日程表里的一行活动：左时间、中标题与场馆、右方形缩略图。
// 纯展示组件：点击由使用方在组件节点上 bindtap 处理（事件会冒泡到宿主节点）。
Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: "" },
    venue: { type: String, value: "" },
    category: { type: String, value: "" },
    image: { type: String, value: "" },
    // 左侧时间栏："19:30" / "末日" / "展期" / "10.05"
    time: { type: String, value: "" },
    // 标题下的强调色小字："10.10 — 10.17 · 共 8 天"
    range: { type: String, value: "" },
    // time 不是钟点（末日 / 展期）时为 true，用强调色小字显示
    span: { type: Boolean, value: false },
  },
  data: {
    imageFailed: false,
  },
  observers: {
    image() {
      this.setData({ imageFailed: false });
    },
  },
  methods: {
    // 部分源（如活动行）有防盗链，加载失败时直接收起缩略图，不留裂图
    onImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
