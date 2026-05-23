const baseUrl = process.env.WEB_BASE_URL;
const secret = process.env.COLLECT_SECRET;

if (!baseUrl) {
  throw new Error("WEB_BASE_URL is required");
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/collect`, {
  method: "POST",
  headers: secret ? { "x-collect-secret": secret } : {},
});

const body = await response.text();
console.log(body);

if (!response.ok && response.status !== 207) {
  throw new Error(`Collector failed with ${response.status}`);
}

