export function shouldFailCollectProcess(result) {
  if (result?.publish_guard?.allowed === false) return true;
  return Number(result?.published_inserted || 0) === 0 || Number(result?.raw_inserted || 0) === 0;
}
