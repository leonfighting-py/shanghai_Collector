const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const MOBILE_HEADERS = {
  ...DEFAULT_HEADERS,
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

const SITE_HEADERS = {
  "maoyan.com": MOBILE_HEADERS,
  "show.maoyan.com": MOBILE_HEADERS,
  "10times.com": {
    ...DEFAULT_HEADERS,
    referer: "https://www.google.com/",
  },
};

function headersFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return SITE_HEADERS[host] || SITE_HEADERS[Object.keys(SITE_HEADERS).find((key) => host.endsWith(key))] || DEFAULT_HEADERS;
}

export async function defaultFetchHtml(url) {
  const response = await fetch(url, {
    headers: headersFor(url),
    signal: AbortSignal.timeout(12_000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function defaultFetchJson(url) {
  const response = await fetch(url, {
    headers: headersFor(url),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
