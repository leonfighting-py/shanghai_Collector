import { parseArtsbirdEvents } from "./artsbird.js";
import { parseAuroraMuseum } from "./auroramuseum.js";
import { parseBendibaoRoundup, parseBendibaoShanghai } from "./bendibao.js";
import { parseChinaArtMuseumExhibitions } from "./artmuseumonline.js";
import { parseChinaDrama } from "./chinadrama.js";
import { parseDamai } from "./damai.js";
import { parseDoubanShanghai } from "./douban.js";
import { parseEventbrite, parseEventbriteAiTech } from "./eventbrite.js";
import { parseFosunFoundation } from "./fosun.js";
import { parseFotografiska } from "./fotografiska.js";
import { parseGewara } from "./gewara.js";
import { parseHuodongBa } from "./huodongba.js";
import { parseHuodongxing } from "./huodongxing.js";
import { parseIMuseumShanghai } from "./imuseum.js";
import { parseLongMuseum } from "./longmuseum.js";
import { parseJsonLdEvents } from "./json-ld.js";
import { parseLuma } from "./luma.js";
import { parseLumaAiEvents, parseMeetupAiEvents } from "./meetup-ai.js";
import { parseMaoyan } from "./maoyan.js";
import { parseMinshengArt } from "./minsheng.js";
import { parseMapExhibitions } from "./map.js";
import { parseNyuShanghai } from "./nyu.js";
import { parsePiaoniu } from "./piaoniu.js";
import {
  parseFotografiskaZh,
  parseListingSite,
  parsePsaShanghai,
  parseRockbundArtMuseum,
  parseShisuEvents,
  parseSjtuEvents,
  parseUccaEdge,
} from "./listing.js";
import { parseShcstheatre } from "./shcstheatre.js";
import { parseShowstart } from "./showstart.js";
import { parseShanghaiMuseum } from "./shmuseum.js";
import { parseShanghaiOnline } from "./shonline.js";
import { parseShqyg } from "./shqyg.js";
import { parseSmartShanghai } from "./smartshanghai.js";
import { parseTeamlab } from "./teamlab.js";
import { parseTimeoutShanghai } from "./timeout.js";
import { parseTongjiSeeEvents } from "./tongji-see.js";
import { parseSnhmEvents } from "./snhm.js";
import { parseSufeEvents } from "./sufe.js";
import { parseSuzhouMuseum } from "./szmuseum.js";
import { parseWechatOfficialAccounts } from "./wechat.js";
import { parseWestbundEvents } from "./westbund.js";
import { parseWestBundMuseum } from "./westbundmuseum.js";
import { parseWhlyjEvents } from "./whlyj.js";
import { parseWinshang } from "./winshang.js";
import { parseWinshangShanghai } from "./winshangsh.js";
import { parseYuzMuseum } from "./yuzmuseum.js";

export { parseJsonLdEvents };

export const PARSERS = {
  artsbird: parseArtsbirdEvents,
  auroraMuseum: parseAuroraMuseum,
  bendibao: parseBendibaoShanghai,
  bendibaoRoundup: parseBendibaoRoundup,
  maoyan: parseMaoyan,
  damai: parseDamai,
  shanghaiMuseum: parseShanghaiMuseum,
  shanghaiOnline: parseShanghaiOnline,
  shcstheatre: parseShcstheatre,
  shqyg: parseShqyg,
  showstart: parseShowstart,
  douban: parseDoubanShanghai,
  smartshanghai: parseSmartShanghai,
  allevents: parseJsonLdEvents,
  fotografiska: parseFotografiska,
  fotografiskaZh: parseFotografiskaZh,
  fosun: parseFosunFoundation,
  gewara: parseGewara,
  rockbund: parseRockbundArtMuseum,
  teamlab: parseTeamlab,
  timeoutShanghai: parseTimeoutShanghai,
  map: parseMapExhibitions,
  chinaArtMuseum: parseChinaArtMuseumExhibitions,
  chinadrama: parseChinaDrama,
  piaoniu: parsePiaoniu,
  psa: parsePsaShanghai,
  ucca: parseUccaEdge,
  huodong: parseHuodongxing,
  huodongBa: parseHuodongBa,
  imuseum: parseIMuseumShanghai,
  minsheng: parseMinshengArt,
  tentimes: parseEventbrite,
  eventbriteAiTech: parseEventbriteAiTech,
  listing: parseListingSite,
  nyu: parseNyuShanghai,
  shisu: parseShisuEvents,
  sjtu: parseSjtuEvents,
  tongjiSee: parseTongjiSeeEvents,
  aitinkerers: parseMeetupAiEvents,
  meetup: parseMeetupAiEvents,
  longMuseum: parseLongMuseum,
  luma: parseLuma,
  lumaAi: parseLumaAiEvents,
  wechat: parseWechatOfficialAccounts,
  snhm: parseSnhmEvents,
  sufe: parseSufeEvents,
  szmuseum: parseSuzhouMuseum,
  westbund: parseWestbundEvents,
  westbundMuseum: parseWestBundMuseum,
  whlyj: parseWhlyjEvents,
  winshang: parseWinshang,
  winshangShanghai: parseWinshangShanghai,
  yuzMuseum: parseYuzMuseum,
};
