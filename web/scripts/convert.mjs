/**
 * Converts the TYPO3 mirror in ../original into clean, semantic content files
 * plus a navigation/data model for the Astro site.
 *
 *   node scripts/convert.mjs
 *
 * Output:
 *   src/data/pages/<slug>.json   one file per page (title, crumbs, body html)
 *   src/data/site.json           home page data + menu tree + utility links
 *   public/fileadmin/...         only the assets actually referenced
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import * as cheerio from 'cheerio'

const ROOT = path.resolve(import.meta.dirname, '../..')
const SRC = path.join(ROOT, 'original')
const WEB = path.resolve(import.meta.dirname, '..')
const OUT_PAGES = path.join(WEB, 'src/data/pages')
const OUT_PUBLIC = path.join(WEB, 'public')

/* ------------------------------------------------------------------ utils */

const seen = new Set()
const assets = new Set()

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
const text = ($el) => clean(decode($el.text()))
const isImage = (p) => /\.(jpe?g|png|svg|webp|gif|avif|ico)(\?|$)/i.test(p || '')
const mirrorPath = (url) => path.join(SRC, decodeURIComponent((url || '').split('?')[0]).replace(/^\//, ''))
const inMirror = (url) => { try { return fsSync.statSync(mirrorPath(url)).isFile() } catch { return false } }
const live = (href) => `https://unishk.edu.al${href}`

/** "/universiteti/vizioni-dhe-misioni.html" -> "universiteti/vizioni-dhe-misioni" */
function toSlug(relFile) {
  const p = relFile.replace(/\\/g, '/').replace(/\.html$/, '').replace(/\/index$/, '')
  return p === 'index' ? '' : p
}
const toUrl = (slug) => (slug ? `/${slug}` : '/')

/** TYPO3 date attributes come as "10-2026-30" (month-year-day). */
function isoDate($time) {
  const raw = $time.attr('datetime') || ''
  const m = raw.match(/^(\d{2})-(\d{4})-(\d{2})$/)
  if (m) return `${m[2]}-${m[1]}-${m[3]}`
  const human = text($time).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (human) return `${human[3]}-${human[2].padStart(2, '0')}-${human[1].padStart(2, '0')}`
  return ''
}
const longDate = (iso) => {
  if (!iso) return ''
  const months = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor']
  const [y, mo, d] = iso.split('-')
  return `${+d} ${months[+mo - 1]} ${y}`
}

async function walk(dir, base = dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, base, out)
    else if (e.name.endsWith('.html')) out.push(path.relative(base, full))
  }
  return out
}

/* ------------------------------------------------------- pass 1: metadata */

const files = (await walk(SRC)).sort()
const pages = new Map() // slug -> { file, title, crumbs }
const titles = new Map()

for (const rel of files) {
  const $ = cheerio.load(await fs.readFile(path.join(SRC, rel), 'utf8'))
  const slug = toSlug(rel)
  const h1 = text($('h1').first())
  const crumbs = $('ul.breadcrumb li')
    .map((_, li) => {
      const a = $(li).find('a').first()
      return { label: text($(li)), href: a.length ? a.attr('href') : null }
    })
    .get()
    .filter((c) => c.label)
  const crumbTitle = crumbs.length ? crumbs[crumbs.length - 1].label : ''
  const docTitle = clean($('title').first().text())
  const title = h1 || crumbTitle || docTitle
  pages.set(slug, { file: rel, title, crumbs })
  titles.set(slug, title)
}
const known = new Set([...pages.keys()].map(toUrl))

/** a mirrored page stays local; anything else points at the live university site */
const localOrLive = (href) => {
  if (!href || href === '#') return href || '#'
  const h = href.startsWith('https://unishk.edu.al')
    ? href.replace('https://unishk.edu.al', '') || '/'
    : href
  if (!h.startsWith('/')) return h
  const bare = h.split('#')[0].split('?')[0].replace(/\.html$/, '').replace(/\/$/, '')
  if (!bare) return '/'
  return known.has(bare) || known.has(bare + '/') ? h : live(h)
}

known.add('/')

/* ------------------------------------------------------- pass 2: content */

const ALLOWED = new Set([
  'a', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'mark', 'small',
  'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'figure', 'figcaption',
  'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'details', 'summary',
  'div', 'iframe', 'video', 'audio', 'source', 'abbr', 'time', 'code', 'pre', 'span',
  'article', 'nav',
  'form', 'label', 'input', 'select', 'option', 'textarea', 'button', 'fieldset', 'legend',
])
const KEEP_ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'width', 'height'],
  video: ['src', 'controls', 'poster', 'width', 'height'],
  audio: ['src', 'controls'],
  source: ['src', 'type'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  div: ['class'],
  details: ['class', 'open'],
  nav: ['class', 'aria-label'],
  article: ['class'],
  span: ['class', 'aria-current'],
  time: ['datetime'],
  input: ['type', 'name', 'value', 'placeholder', 'required'],
  select: ['name'], option: ['value', 'selected'], textarea: ['name', 'rows', 'placeholder'],
  button: ['type'], label: ['for'],
}

const JUNK = ['script', 'style', 'noscript', 'link', 'meta', 'svg', 'symbol', 'defs', 'path', 'use', 'font'].join(',')

function sanitize($, ctx) {
  // jQuery-era accordions -> native <details>
  $('.accordion').each((_, el) => {
    const a = $(el)
    const head = a.find('.titleAccordion').first()
    const body = a.find('.contentAccordion').first()
    const summary = clean(head.find('h1,h2,h3,h4,h5,h6').first().text() || head.text())
    const inner = body.length ? body.html() : ''
    a.replaceWith(`<details class="disclosure"><summary>${summary}</summary><div class="disclosure__body">${inner}</div></details>`)
  })

  // <details> the editors wrote by hand get the same treatment
  $('details').each((_, el) => {
    const d = $(el)
    if (!d.children('summary').length) return
    d.addClass('disclosure')
    if (!d.children('div.disclosure__body').length) {
      const body = $('<div class="disclosure__body"></div>')
      body.append(d.children().not('summary'))
      d.append(body)
    }
  })

  // news cards -> plain semantic article
  $('.article').each((_, el) => {
    const a = $(el)
    const link = a.find('a.full-link').first()
    const href = link.attr('href') || ''
    const t = clean(decode(link.attr('title') || a.find('h6').first().text()))
    const iso = isoDate(a.find('time').first())
    a.replaceWith(`<article class="notice"><a href="${href}"><time datetime="${iso}">${longDate(iso)}</time><span class="notice__title">${t}</span></a></article>`)
  })

  // pagination -> compact nav (keep the current page and its neighbours)
  $('.f3-widget-paginator').each((_, el) => {
    const entries = $(el).children('li').map((__, li) => {
      const a = $(li).find('a').first()
      const n = clean($(li).text())
      return { n, href: a.length ? a.attr('href') || '#' : '' }
    }).get().filter((e) => /^\d+$/.test(e.n))
    if (!entries.length) return $(el).remove()
    const current = entries.findIndex((e) => !e.href)
    const last = entries.length - 1
    const keep = new Set([0, 1, current - 1, current, current + 1, last - 1, last])
    const items = []
    entries.forEach((e, i) => {
      if (keep.has(i)) {
        items.push(e.href ? `<a href="${e.href}">${e.n}</a>` : `<span class="pager__current" aria-current="page">${e.n}</span>`)
      } else if (keep.has(i - 1)) items.push('<span class="pager__gap">…</span>')
    })
    $(el).replaceWith(`<nav class="pager" aria-label="Faqet">${items.join('')}</nav>`)
  })

  $('table').each((_, el) => {
    const t = $(el)
    if (!t.parent().is('div.tablescroll')) t.wrap('<div class="tablescroll"></div>')
    if (!t.find('thead').length && t.find('tr th').length) {
      const rows = t.find('tr')
      rows.first().wrap('<thead></thead>')
      t.find('tr:not(thead tr)').wrapAll('<tbody></tbody>')
    }
  })
  $('iframe').each((_, el) => {
    const f = $(el)
    if (!f.parent().is('div.embed')) f.wrap('<div class="embed"></div>')
  })

  $('*').each((_, el) => {
    if (el.type !== 'tag') return
    if (JUNK.split(',').includes(el.name)) {
      if (['script', 'style', 'noscript', 'svg', 'symbol', 'defs', 'path', 'use'].includes(el.name)) $(el).remove()
      else $(el).replaceWith($(el).contents())
    }
  })
  $('i.fa, i.fas, i.far, i.fab, i[class*=" fa-"]').remove()

  // heading scale: size the content relative to whatever level the editors used,
  // so a page that only ever uses <h4> still gets a real top-level heading
  const levels = $('h1,h2,h3,h4,h5,h6').map((_, el) => +el.name[1]).get().filter(Number.isFinite)
  const shift = levels.length ? Math.min(...levels) - 2 : 0
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const n = Math.min(4, Math.max(2, +el.name[1] - shift))
    el.name = `h${n}`
  })

  // headings carrying a whole paragraph are body copy: demote, and drop the
  // redundant <strong> that editors used to make them bold
  $('h2,h3,h4').each((_, el) => {
    const h = $(el)
    h.find('strong,b').each((__, s) => $(s).replaceWith($(s).contents()))
    if (clean(h.text()).length > 120) el.name = 'p'
  })

  // the page <h1>/breadcrumb already carries the title
  const firstHeading = $('h2,h3,h4').first()
  if (firstHeading.length && clean(firstHeading.text()).toLowerCase() === clean(ctx.title || '').toLowerCase()) {
    firstHeading.remove()
  }

  // strip classes/ids but remember layout hints we care about
  $('*[class]').each((_, el) => {
    const keep = []
    const cls = ($(el).attr('class') || '').split(/\s+/)
    for (const c of cls) {
      if (['notice', 'disclosure', 'disclosure__body', 'notice__title', 'pager', 'pager__current', 'pager__gap', 'tablescroll', 'embed'].includes(c)) keep.push(c)
    }
    if (keep.length) $(el).attr('class', keep.join(' '))
    else $(el).removeAttr('class')
    $(el).removeAttr('id')
    $(el).removeAttr('style')
    $(el).removeAttr('align')
    $(el).removeAttr('border')
    $(el).removeAttr('cellpadding')
    $(el).removeAttr('cellspacing')
  })

  // tag + attribute whitelist; unwrap anything else
  $('*').each((_, el) => {
    if (el.type !== 'tag') return
    const name = el.name.toLowerCase()
    if (!ALLOWED.has(name)) {
      $(el).replaceWith($(el).contents())
      return
    }
    const allow = KEEP_ATTRS[name] || []
    for (const attr of Object.keys(el.attribs || {})) {
      if (!allow.includes(attr)) $(el).removeAttr(attr)
    }
  })

  // links: keep internal paths, send missing pages to the live site
  $('a[href]').each((_, el) => {
    const a = $(el)
    let href = (a.attr('href') || '').trim()
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    if (href.startsWith('https://unishk.edu.al')) href = href.replace('https://unishk.edu.al', '') || '/'
    if (href.startsWith('/')) {
      // query-string URLs are TYPO3 pagination/plugins we did not mirror
      if (href.includes('?') && !/^\/fileadmin\//.test(href)) {
        a.attr('href', live(href)); a.attr('rel', 'noopener'); a.attr('data-external', '')
        return
      }
      const bare = href.split('#')[0].split('?')[0].replace(/\.html$/, '').replace(/\/$/, '')
      const hit = known.has(bare || '/') || known.has(bare + '/')
      if (!hit) {
        if (/^\/fileadmin\//.test(href)) return // asset: handled below
        a.attr('href', live(href))
        a.attr('rel', 'noopener')
        a.attr('data-external', '')
      }
    } else if (!/^[a-z]+:/i.test(href) && !href.startsWith('#')) {
      a.attr('href', '/' + href.replace(/^\.\//, ''))
    }
  })

  $('img').each((_, el) => {
    const img = $(el)
    const src = (img.attr('src') || '').trim()
    if (!src) return img.remove()
    if (/^\/_processed_|^\/fileadmin\//.test(src)) {
      if (isImage(src) && inMirror(src)) ctx.assets.add(src)
      else if (!/^https?:/.test(src)) img.attr('src', live(src))
    }
    img.attr('loading', 'lazy')
    img.attr('decoding', 'async')
    if (!img.attr('alt')) img.attr('alt', '')
    if (!img.attr('width')) img.removeAttr('width')
    if (!img.attr('height')) img.removeAttr('height')
  })
  // documents stay on the live server: the mirror keeps a local copy, the
  // built site does not need to ship 600 MB of PDFs
  $('a[href^="/fileadmin/"]').each((_, el) => {
    const a = $(el)
    const href = a.attr('href')
    if (isImage(href) && inMirror(href)) { ctx.assets.add(href); return }
    a.attr('href', live(href))
    a.attr('data-external', '')
    a.attr('rel', 'noopener')
  })
  $('video[src^="/fileadmin/"], audio[src^="/fileadmin/"], source[src^="/fileadmin/"]').each((_, el) => {
    const m = $(el)
    m.attr('src', live(m.attr('src')))
  })
  $('iframe[src^="/"]').each((_, el) => { $(el).remove() })

  // drop spacer paragraphs and empty containers
  $('p').each((_, el) => {
    const t = clean($(el).text())
    if (!t && !$(el).find('img,iframe,video,audio,br').length) $(el).remove()
  })

  // unwrap structural leftovers: classless divs/spans carry nothing but nesting
  $('div:not([class]), span:not([class]), center').each((_, el) => {
    $(el).replaceWith($(el).contents())
  })

  // comments, empty wrappers, whitespace noise
  $('*').addBack().contents().each((_, node) => {
    if (node.type === 'comment') $(node).remove()
  })
  const collapse = (nodes) => {
    for (const child of nodes) {
      if (child.type === 'text') {
        child.data = child.data.replace(/[ \t\r\n]+/g, ' ')
        if (!child.data.trim()) child.data = ''
      } else if (child.children) {
        collapse(child.children)
      }
    }
  }
  collapse($.root()[0].children)

  return $.html()
}

const out = []
for (const [slug, meta] of pages) {
  if (slug === '') continue // home page is hand-built
  const $ = cheerio.load(await fs.readFile(path.join(SRC, meta.file), 'utf8'))

  $('header, footer, .page-breadcrum, #slider-2026, #loader-wrapper, .scroll-top, .test-faq, noscript, script, style').remove()
  $('.sidebarOne, .course-progress, .shifra-2026, .theme-manage-area').remove()
  $('.main-page-wrapper .container.cont-2026').remove()

  const wrap = $('.main-page-wrapper').first()
  const html = (wrap.length ? wrap : $('body')).html() || ''

  const ctx = { assets, title: meta.title }

  const $c = cheerio.load(html, null, false)
  sanitize($c, ctx)

  const body = $c.html() || ''
  const empty = !clean($c.root().text()) && !$c.root().find('img,iframe,table,video').length
  if (empty) console.log(`  · empty page upstream: ${slug}`)

  const crumbs = meta.crumbs.filter((c) => c.label && !/^Universiteti i Shkodrës/.test(c.label))
  const section = crumbs.length ? crumbs[0].label : ''
  out.push({
    slug,
    path: toUrl(slug),
    title: meta.title,
    description: '',
    empty,
    section,
    crumbs: crumbs.map((c) => ({ label: c.label, href: c.href ? localOrLive(c.href) : null })),
    body: empty ? '' : body,
  })
}

await fs.rm(OUT_PAGES, { recursive: true, force: true })
await fs.mkdir(OUT_PAGES, { recursive: true })
for (const p of out) {
  const name = p.slug.replace(/\//g, '__')
  await fs.writeFile(path.join(OUT_PAGES, `${name}.json`), JSON.stringify(p))
}

/* --------------------------------------------------- home page data model */

const $home = cheerio.load(await fs.readFile(path.join(SRC, 'index.html'), 'utf8'))


const nav = $home('.nav.navbar-nav > li').map((_, li) => {
  const a = $home(li).children('a').first()
  const kids = $home(li).find('.sub-menu > li > a').map((__, k) => ({
    label: text($home(k)), href: localOrLive($home(k).attr('href') || '#'),
  })).get()

  // dropdown parents in the old menu had no page of their own: point them at
  // the section their children share, so the top-level link is never a dead end
  let href = (a.attr('href') || '').trim()
  if (!href || href === '#' || href === '/') {
    const first = kids.find((k) => /^\//.test(k.href) && k.href !== '/')
    const segment = first && '/' + first.href.split('/').filter(Boolean)[0]
    href = segment && (known.has(segment) || known.has(segment + '/')) ? segment : first?.href || '/'
  }
  return { label: text(a), href: href || '/', children: kids }
}).get()

const lists = (id) => $home(`#news-container-${id} .article`).map((_, el) => {
  const a = $home(el)
  const link = a.find('a.full-link').first()
  const iso = isoDate(a.find('time').first())
  return {
    title: clean(decode(link.attr('title') || a.find('h6').first().text())),
    href: localOrLive(link.attr('href') || '#'),
    date: iso,
    dateLabel: longDate(iso),
  }
}).get()

const localImage = (src) => {
  if (!src) return ''
  if (/^https?:/.test(src)) return src
  if (inMirror(src) && isImage(src)) { assets.add(src); return src }
  return live(src)
}

const faculties = $home('.frame-fakultetet').map((_, el) => {
  const f = $home(el)
  const link = f.find('a[href^="/universiteti"]').first()
  return {
    name: clean(f.find('h3').text()),
    href: localOrLive(link.attr('href') || '#'),
    image: localImage(f.find('img').attr('src') || ''),
  }
}).get()

const stats = $home('.shifra-2026 .col-2026').map((_, el) => {
  const s = $home(el)
  return {
    value: s.find('.timer').attr('data-to') || '', label: clean(s.find('p').text()).replace(/\s+/g, ' '),
  }
}).get()

const hero = localImage($home('#slider-2026 img').attr('src') || '')

const utility = {
  student: [
    { label: 'Studenti', href: '/' },
    { label: 'Sistemi i studentit', href: 'https://ushk.pitagora.rash.al/login' },
    { label: 'Microsoft Teams', href: 'https://teams.microsoft.com/' },
    { label: 'Libraria dixhitale', href: 'https://ulibrary.rash.al/' },
    { label: 'Biblioteka universitare', href: 'http://bush.unishk.edu.al/' },
  ],
  staff: [
    { label: 'Stafi', href: '/' },
    { label: 'Sistemi i pedagogut', href: 'https://ushk.pitagora.rash.al/login' },
    { label: 'Microsoft Teams', href: 'https://teams.microsoft.com/' },
    { label: 'Libraria dixhitale', href: 'https://ulibrary.rash.al/' },
    { label: 'Biblioteka universitare', href: 'http://bush.unishk.edu.al/' },
    { label: 'SMAK', href: 'https://smak.unishk.edu.al/home' },
  ],
  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/Universiteti.Shkoder.Luigj.Gurakuqi', icon: 'facebook' },
    { label: 'Instagram', href: 'https://www.instagram.com/universiteti.luigj.gurakuqi/', icon: 'instagram' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/universiteti-i-shkodr%C3%ABs-luigj-gurakuqi-459933173/', icon: 'linkedin' },
    { label: 'Email', href: 'https://outlook.office.com/mail/', icon: 'mail' },
  ],
}

if (hero) assets.add(hero)
for (const f of faculties) if (f.image) assets.add(f.image)

const site = {
  name: 'Universiteti i Shkodrës "Luigj Gurakuqi"',
  shortName: 'UNISHK',
  hero,
  nav,
  utility,
  news: lists(4),
  activities: lists(34),
  faculties,
  stats,
  quickLinks: $home('#c259 a').map((_, a) => ({ label: text($home(a)), href: $home(a).attr('href') || '#' })).get(),
  rector: {
    text: clean($home('#c9 p.text-center').map((_, p) => text($home(p))).get().filter((t) => t && t.length > 40).join(' ')),
    href: '/universiteti/autoritetet-dhe-organet-drejtuese/rektori/pershendetja-e-rektorit',
  },
}

await fs.writeFile(path.join(WEB, 'src/data/site.json'), JSON.stringify(site, null, 1))

/* -------------------------------------------------------- asset copying */

let copied = 0
let bytes = 0
const missing = []
for (const url of assets) {
  if (!isImage(url)) continue
  const rel = decodeURIComponent(url.split('?')[0]).replace(/^\//, '')
  const from = path.join(SRC, rel)
  const to = path.join(OUT_PUBLIC, rel)
  try {
    const st = await fs.stat(from)
    if (!st.isFile()) continue
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
    copied++
    bytes += st.size
  } catch {
    missing.push(url)
  }
}

console.log(`pages:      ${out.length}`)
console.log(`nav items:  ${nav.length} top-level, ${nav.reduce((n, i) => n + i.children.length, 0)} children`)
console.log(`news:       ${site.news.length} home / ${site.activities.length} activities`)
console.log(`assets:     ${copied} files, ${(bytes / 1048576).toFixed(1)} MB`)
if (missing.length) console.log(`missing:    ${missing.length} (${missing.slice(0, 3).join(', ')})`)
