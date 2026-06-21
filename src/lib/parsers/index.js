import { parseChinaArtMuseumExhibitions } from "./artmuseumonline.js";
import { parseDamai } from "./damai.js";
import { parseDoubanShanghai } from "./douban.js";
import { parseEventbrite, parseEventbriteAiTech } from "./eventbrite.js";
import { parseFosunFoundation } from "./fosun.js";
import { parseFotografiska } from "./fotografiska.js";
import { parseHuodongBa } from "./huodongba.js";
import { parseHuodongxing } from "./huodongxing.js";
import { parseJsonLdEvents } from "./json-ld.js";
import { parseLuma } from "./luma.js";
import { parseMaoyan } from "./maoyan.js";
import { parseMapExhibitions } from "./map.js";
import { parseNyuShanghai } from "./nyu.js";
import {
  parseFotografiskaZh,
  parseListingSite,
  parsePsaShanghai,
  parseRockbundArtMuseum,
  parseShisuEvents,
  parseSjtuEvents,
  parseUccaEdge,
} from "./listing.js";
import { parseShowstart } from "./showstart.js";
import { parseSmartShanghai } from "./smartshanghai.js";
import { parseTeamlab } from "./teamlab.js";
import { parseTongjiSeeEvents } from "./tongji-see.js";
import { parseWechatOfficialAccounts } from "./wechat.js";

export { parseJsonLdEvents };

export const PARSERS = {
  maoyan: parseMaoyan,
  damai: parseDamai,
  showstart: parseShowstart,
  douban: parseDoubanShanghai,
  smartshanghai: parseSmartShanghai,
  allevents: parseJsonLdEvents,
  fotografiska: parseFotografiska,
  fotografiskaZh: parseFotografiskaZh,
  fosun: parseFosunFoundation,
  rockbund: parseRockbundArtMuseum,
  teamlab: parseTeamlab,
  map: parseMapExhibitions,
  chinaArtMuseum: parseChinaArtMuseumExhibitions,
  psa: parsePsaShanghai,
  ucca: parseUccaEdge,
  huodong: parseHuodongxing,
  huodongBa: parseHuodongBa,
  tentimes: parseEventbrite,
  eventbriteAiTech: parseEventbriteAiTech,
  listing: parseListingSite,
  nyu: parseNyuShanghai,
  shisu: parseShisuEvents,
  sjtu: parseSjtuEvents,
  tongjiSee: parseTongjiSeeEvents,
  aitinkerers: parseJsonLdEvents,
  meetup: parseJsonLdEvents,
  luma: parseLuma,
  wechat: parseWechatOfficialAccounts,
};
