/**
 * Rewrite root-absolute asset/link paths to page-relative ones.
 *
 * Astro emits href="/_astro/app.css" style URLs, which only work when the site
 * is served from a domain root. Making them relative means the same dist/
 * folder works when opened straight from disk (file://) and when deployed into
 * a subdirectory — handy for review copies.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.resolve(process.argv[2] || 'dist')
// set for GitHub project pages, e.g. PAGES_BASE=/unishk-site
const BASE = (process.env.PAGES_BASE || '').replace(/\/$/, '')
const CANON = /<link rel="canonical"[^>]*>/g

const walk = async (dir) => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

const relativizeSrcset = (value, prefix) =>
  value
    .split(',')
    .map((part) => {
      const [url, ...rest] = part.trim().split(/\s+/)
      return [url.startsWith('/') ? prefix + url.slice(1) : url, ...rest].join(' ')
    })
    .join(', ')

const files = await walk(DIST)
let rewritten = 0

for (const file of files) {
  const rel = path.relative(DIST, file)              // e.g. universiteti/x/index.html
  const depth = rel.split(path.sep).length - 1       // directory depth of the page
  const prefix = depth === 0 ? '' : '../'.repeat(depth)

  // 404.html is served at arbitrary URLs, so its asset paths must stay rooted —
  // and on a project page they also need the repository prefix
  if (rel === '404.html') {
    if (!BASE) continue
    const raw = await readFile(file, 'utf8')
    await writeFile(
      file,
      raw.replace(/(\s(?:href|src|poster)=")\/(?!\/)/g, (_, open) => `${open}${BASE}/`),
    )
    rewritten++
    continue
  }

  let html = await readFile(file, 'utf8')
  if (!html.includes('="/')) continue

  // canonical URLs must stay absolute; park them while we rewrite
  const canon = []
  html = html.replace(CANON, (tag) => {
    canon.push(tag)
    return `\u0000CANON${canon.length - 1}\u0000`
  })

  html = html.replace(/(\s(?:href|src|poster)=")(\/[^"]*)(")/g, (_, open, url, close) => {
    if (url.startsWith('//')) return open + url + close
    if (url === '/') return open + (prefix || './') + close
    return open + prefix + url.slice(1) + close
  })

  html = html.replace(/(\ssrcset=")([^"]*)(")/g, (_, open, value, close) =>
    open + relativizeSrcset(value, prefix) + close,
  )

  html = html.replace(/\u0000CANON(\d+)\u0000/g, (_, i) => canon[+i])

  await writeFile(file, html)
  rewritten++
}

// CSS emitted by the bundler can reference absolutely-rooted assets too
let css = 0
const walkCss = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walkCss(full)
    else if (entry.name.endsWith('.css')) {
      const text = await readFile(full, 'utf8')
      if (!text.includes('url(/')) continue
      const rel = path.relative(path.join(DIST, '_astro'), full)
      const depth = rel.split(path.sep).length - 1
      const prefix = depth === 0 ? '' : '../'.repeat(depth)
      await writeFile(full, text.replace(/url\(\//g, `url(${prefix}`))
      css++
    }
  }
}
if (await stat(path.join(DIST, '_astro')).catch(() => null)) await walkCss(path.join(DIST, '_astro'))

console.log(`relativize: ${rewritten} html files${css ? `, ${css} css files` : ''}`)
