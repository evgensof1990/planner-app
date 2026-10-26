// Minimal CalDAV client (RFC 4791) for Yandex Calendar: discovery, event queries, PUT/DELETE.
// No dependencies: XML responses are read with tolerant regexes (any namespace prefix).

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const tagRe = (name) => new RegExp(`<(?:[\\w-]+:)?${name}(?=[\\s/>])[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>)`, 'i');
export const tag = (xml, name) => {
  const m = xml.match(tagRe(name));
  return m ? decode((m[1] || '').trim()) : null;
};
export const hasTag = (xml, name) => tagRe(name).test(xml);

// [{href, ok, xml}] where xml is the content of the 200 propstat
export function responses(xml) {
  const out = [];
  const re = /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[1];
    const href = decode((body.match(tagRe('href')) || [])[1] || '').trim();
    const stats = [...body.matchAll(/<(?:[\w-]+:)?propstat\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?propstat>/gi)].map((x) => x[1]);
    const good = stats.find((s) => / 200 /.test(tag(s, 'status') || '')) || '';
    out.push({ href, ok: !!good, xml: good, status: tag(body, 'status') });
  }
  return out;
}

const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

export class CalDav {
  constructor({ url = 'https://caldav.yandex.ru', user, password, fetchImpl = fetch, timeoutMs = 30000 }) {
    this.base = url.replace(/\/$/, '');
    this.auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  abs(href) {
    return /^https?:/.test(href) ? href : this.base + href;
  }

  async req(method, href, { body, headers = {}, ok = [200, 201, 204, 207] } = {}) {
    const r = await this.fetch(this.abs(href), {
      method,
      body,
      headers: { Authorization: this.auth, ...(body ? { 'Content-Type': headers['Content-Type'] || 'application/xml; charset=utf-8' } : {}), ...headers },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'follow',
    });
    const text = await r.text();
    if (r.status === 401) throw Object.assign(new Error('Яндекс не принял логин или пароль приложения'), { status: 401 });
    if (!ok.includes(r.status)) throw Object.assign(new Error(`CalDAV ${method} ${href}: ${r.status}`), { status: r.status, body: text.slice(0, 500) });
    return { status: r.status, text, etag: r.headers.get('etag') };
  }

  propfind(href, depth, props) {
    const body = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`;
    return this.req('PROPFIND', href, { body, headers: { Depth: String(depth) } });
  }

  // [{href, name, color, ctag, events:boolean}]
  async calendars() {
    if (!this.home) {
      const p = await this.propfind('/', 0, '<d:current-user-principal/>');
      const principal = tag(responses(p.text)[0]?.xml || '', 'current-user-principal');
      const principalHref = principal ? tag(principal, 'href') : null;
      if (!principalHref) throw new Error('CalDAV: не найден principal пользователя');
      const h = await this.propfind(principalHref, 0, '<c:calendar-home-set/>');
      const home = tag(responses(h.text)[0]?.xml || '', 'calendar-home-set');
      this.home = home ? tag(home, 'href') : null;
      if (!this.home) throw new Error('CalDAV: не найден calendar-home-set');
    }
    const r = await this.propfind(this.home, 1, '<d:displayname/><d:resourcetype/><cs:getctag/><ic:calendar-color/><c:supported-calendar-component-set/>');
    return responses(r.text)
      .filter((x) => x.ok && hasTag((x.xml.match(tagRe('resourcetype')) || [''])[0].replace(/^<[^>]*>/, ''), 'calendar'))
      .map((x) => {
        const comps = x.xml.match(tagRe('supported-calendar-component-set'));
        return {
          href: x.href,
          name: tag(x.xml, 'displayname') || x.href,
          color: (tag(x.xml, 'calendar-color') || '').slice(0, 7) || null,
          ctag: tag(x.xml, 'getctag'),
          events: !comps || /VEVENT/i.test(comps[0]),
        };
      });
  }

  // [{href, etag, ics}] of objects overlapping [from, to]
  async events(calHref, from, to) {
    const range = from && to ? `<c:time-range start="${icsStamp(from)}" end="${icsStamp(to)}"/>` : '';
    const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">${range}</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const r = await this.req('REPORT', calHref, { body, headers: { Depth: '1' } });
    return responses(r.text)
      .filter((x) => x.ok)
      .map((x) => ({ href: x.href, etag: tag(x.xml, 'getetag'), ics: tag(x.xml, 'calendar-data') || '' }))
      .filter((x) => x.ics.includes('BEGIN:VEVENT'));
  }

  // Creates (etag=null) or updates an event; returns the new etag (may be null if the server omits it)
  async put(href, ics, etag) {
    const headers = { 'Content-Type': 'text/calendar; charset=utf-8', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) };
    const r = await this.req('PUT', href, { body: ics, headers, ok: [200, 201, 204] });
    return r.etag;
  }

  async remove(href, etag) {
    await this.req('DELETE', href, { headers: etag ? { 'If-Match': etag } : {}, ok: [200, 204, 404, 410] });
  }

  async etagOf(href) {
    const r = await this.propfind(href, 0, '<d:getetag/>');
    return tag(responses(r.text)[0]?.xml || '', 'getetag');
  }
}
