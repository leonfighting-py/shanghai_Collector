export function shouldFailCollectProcess(result) {
  return Number(result?.published_inserted || 0) === 0 || Number(result?.raw_inserted || 0) === 0;
}
