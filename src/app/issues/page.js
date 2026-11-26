import { listIssues } from "../../lib/issues.js";

// 列表随每轮采集增加一条。用 force-dynamic 而不是 ISR：
// 构建机有没有库连接不该决定首页那一刻看到的是不是空列表。
export const dynamic = "force-dynamic";

export const metadata = {
  title: "往期 · 上海活动雷达",
  description: "每两日一期的活动精选归档，按日期倒序。",
};

export default async function IssuesPage() {
  const issues = await listIssues({ limit: 60 });

  return (
    <div id="top">
      <main className="sheet" id="city-discoveries">
        <div className="issue-strip">
          <p className="eyebrow">往期</p>
          <dl className="stats">
            <div><dt>{issues.length}</dt><dd>期已归档</dd></div>
          </dl>
        </div>

        <section aria-label="往期列表">
          <div className="sec-head">
            <h2>全部往期</h2>
            <span>按日期倒序</span>
          </div>
          {issues.length > 0 ? (
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue.date}>
                  <a href={`/issue/${issue.date}`}>
                    <b>{issue.date}</b>
                    <span className="issue-label">{issue.label}</span>
                    <span className="issue-meta">
                      {issue.highlightCount} 条推荐 · {issue.stats?.upcoming ?? 0} 场即将开始 ·{" "}
                      {issue.stats?.venues ?? 0} 个场馆
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">还没有归档。每完成一轮采集，就会存下当期快照。</p>
          )}
        </section>

        <footer className="colophon">
          <span>归档不随活动清理改变</span>
          <span className="colophon-links">
            <a href="/">返回首页</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
