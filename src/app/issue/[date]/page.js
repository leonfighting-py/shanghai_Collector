import { notFound } from "next/navigation";

import { EventImage } from "../../components/EventImage.js";
import { formatCardTime } from "../../../lib/agenda.js";
import { getIssue } from "../../../lib/issues.js";

// 归档是快照，内容不会再变；给 1 天缓存
export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { date } = await params;
  return {
    title: `${date} 期 · 上海活动雷达`,
    description: `${date} 这一期的活动精选与统计。`,
  };
}

export default async function IssuePage({ params }) {
  const { date } = await params;
  const issue = await getIssue(date);
  if (!issue) notFound();

  return (
    <div id="top">
      <main className="sheet" id="city-discoveries">
        <div className="issue-strip">
          <p className="eyebrow">
            往期 · {date}
            <a className="issue-back" href="/issues">全部往期</a>
          </p>
          <dl className="stats">
            <div><dt>{issue.stats.upcoming ?? 0}</dt><dd>场即将开始</dd></div>
            <div><dt>{issue.stats.ongoing ?? 0}</dt><dd>场正在进行</dd></div>
            <div><dt>{issue.stats.venues ?? 0}</dt><dd>个场馆</dd></div>
          </dl>
        </div>

        <section aria-label="当期推荐">
          <div className="sec-head">
            <h2>当期推荐</h2>
            <span>
              {issue.label}
              <a className="issue-back" href={`/issue/${date}/poster.png`} download>
                保存海报
              </a>
            </span>
          </div>
          {issue.highlights.length > 0 ? (
            <div className="picks">
              {issue.highlights.map((item, index) => (
                <a className="pick" key={item.slug || index} href={`/e/${item.slug}`}>
                  <span className="cover" data-label={item.category}>
                    <EventImage url={item.image_url} width={800} />
                  </span>
                  <span className="pick-no">N° 0{index + 1} · {item.category}</span>
                  <strong>{item.title}</strong>
                  <small>{formatCardTime(item)} · {item.venue}</small>
                </a>
              ))}
            </div>
          ) : (
            <p className="empty">这一期没有封面推荐。</p>
          )}
        </section>

        <p className="issue-note">
          这是 {date} 保存的当期快照。活动本身可能已经结束或被清理，页面仍按当时的记录展示；
          点进详情若活动已下线，会看到「已结束」页。
        </p>

        <footer className="colophon">
          <span>数据每两日自动更新 · 归档不随活动清理改变</span>
          <span className="colophon-links">
            <a href="/issues">全部往期</a>
            <a href="/">返回首页</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
