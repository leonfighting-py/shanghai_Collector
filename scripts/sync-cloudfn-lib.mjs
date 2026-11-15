// 把 src/lib 里云函数依赖的纯函数复制成 miniprogram/cloudfunctions/events/lib/*.mjs。
//
// 以前这一步靠人手工 cp + 改 import 后缀，忘了就静默漂移：小程序和 Web 算出不同的集合，
// 而两边各自跑测试都不报错。现在一条命令：npm run sync:cloudfn
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LIB_COPIES, toMjs } from "./cloudfn-lib-copies.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "src/lib");
const to = path.join(root, "miniprogram/cloudfunctions/events/lib");

fs.mkdirSync(to, { recursive: true });

let changed = 0;
for (const [source, copy] of LIB_COPIES) {
  const next = toMjs(fs.readFileSync(path.join(from, source), "utf8"));
  const target = path.join(to, copy);
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (current === next) {
    console.log(`·  ${copy} 无变化`);
    continue;
  }
  fs.writeFileSync(target, next);
  changed += 1;
  console.log(`✓  ${copy} 已同步`);
}

// 源文件被改名合并后，旧副本会留在目录里继续被误用。这里只提示、不自动删：
// 删文件要人确认，而且 parity 测试会把这个目录的文件集合卡死，跑测试同样能发现。
const expected = new Set(LIB_COPIES.map(([, copy]) => copy));
const extra = fs
  .readdirSync(to)
  .filter((name) => name.endsWith(".mjs") && !expected.has(name));
for (const name of extra) {
  console.warn(`!  ${name} 不在依赖闭包里，确认没用后手工删除（npm test 会一直红）`);
}

console.log(changed === 0 ? "全部已是最新。" : `完成，${changed} 个文件已同步。`);
