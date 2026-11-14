import { CATEGORIES } from "../../../lib/events.js";

// 查不到的 slug 会走到这里。Next 只能出 404（App Router 没有 gone()），
// 不再区分「活动已结束」和「地址写错了」——对用户和搜索引擎都是同一种结果：这页没有了。
// 所以这里只给两条出路，不放空白的「404」。
export default function EventNotFound() {
  return (
    <main className="sheet detail">
      <a className="detail-back" href="/">
        ← 回到日程表
      </a>
      <header className="detail-head">
        <p className="eyebrow">没有这场活动</p>
        <h1>这场活动已经结束，或者不在最近两周的窗口里</h1>
        <p className="detail-when">活动下线后本站不再保留页面，下面这些入口还是活的。</p>
      </header>

      <div className="detail-actions">
        <a className="btn-primary" href="/#agenda">
          看最近两周还有什么
        </a>
      </div>

      <section className="related" aria-label="按类目看">
        <div className="sec-head">
          <h2>按类目看</h2>
          <span>首页默认展示全部</span>
        </div>
        <div className="filter-group">
          {CATEGORIES.map((name) => (
            <a className="fchip" key={name} href={`/?category=${encodeURIComponent(name)}#agenda`}>
              {name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
