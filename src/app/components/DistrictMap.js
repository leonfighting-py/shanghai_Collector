import { MAP_VIEWBOX } from "../../lib/district-map.js";

/**
 * 16 区示意图。纯展示：数据从 buildDistrictMap 来，点击回调交给上层。
 * 用 SVG 而不是 CSS grid —— 后面接真实边界（第 15 天）时只换 tiles 的坐标，不动结构。
 */
export function DistrictMap({ map, district, onSelect }) {
  return (
    <section className="district-view" aria-label="按区看">
      <div className="map-head">
        <h2>按区看</h2>
        <p>
          点区块筛选该区，再点一次取消
          {district ? (
            <button type="button" className="chip-btn is-plain" onClick={() => onSelect("")}>
              清除：{district}
            </button>
          ) : null}
        </p>
      </div>
      <svg className="district-map" viewBox={MAP_VIEWBOX} role="group" aria-label="上海各区活动分布">
        {map.tiles.map((tile) => {
          const active = district === tile.name;
          return (
            <g
              key={tile.name}
              className={`map-tile is-level-${tile.level}${active ? " is-active" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${tile.name} ${tile.count} 场`}
              onClick={() => onSelect(active ? "" : tile.name)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(active ? "" : tile.name);
              }}
            >
              <rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} rx="1.6" />
              <text
                className="tile-name"
                x={tile.x + tile.width / 2}
                y={tile.y + tile.height / 2 + 0.4}
                textAnchor="middle"
              >
                {tile.name}
              </text>
              <text
                className="tile-count"
                x={tile.x + tile.width / 2}
                y={tile.y + tile.height / 2 + 5.4}
                textAnchor="middle"
              >
                {tile.count}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="map-foot">
        当前筛选共 {map.total} 场，分布在 {map.tiles.filter((tile) => tile.count > 0).length} 个区
        {map.unknown > 0 ? `；另有 ${map.unknown} 场未标注区域（不计入区块）` : ""}
      </p>
    </section>
  );
}
