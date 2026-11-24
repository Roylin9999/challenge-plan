// Soda widget loader (ASCII only - safe to copy/paste or send by LINE)
// Downloads the latest widget code from the site, so updates need no re-paste.
const SITE = 'https://challenge-plan.joy23419.workers.dev';
const fm = FileManager.local();
const cache = fm.joinPath(fm.documentsDirectory(), 'soda-widget-cache.js');
let code = '';
try {
  const r = new Request(SITE + '/widget.js?t=' + Date.now());
  r.timeoutInterval = 15;
  code = await r.loadString();
  if (r.response.statusCode === 200 && code.length > 1000) fm.writeString(cache, code);
  else code = '';
} catch (e) {}
if (!code && fm.fileExists(cache)) code = fm.readString(cache);
if (!code) throw new Error('Cannot load widget code from ' + SITE);
await eval('(async () => {' + code + '\n})()');
