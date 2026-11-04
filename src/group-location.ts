export function groupBasePath() {
  return location.pathname.match(/^\/g\/[a-f0-9]{32}(?=\/|$)/)?.[0] || '';
}
export const groupChannel = () => 'bandarlog-data' + groupBasePath();
