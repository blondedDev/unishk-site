# UNISHK — rebuilt website

A static rebuild of **https://unishk.edu.al/** (Universiteti i Shkodrës “Luigj Gurakuqi”),
taken from a local mirror of the live site and rebuilt with Astro. No CMS, no
jQuery, no icon fonts, no build-time framework: the output is plain HTML, CSS and
a few kilobytes of vanilla JavaScript.

```
~/Desktop/unishk-site/
├── original/        TYPO3 mirror of the live site (191 pages + assets, 675 MB) — the source of truth
├── web/             the Astro project
│   ├── src/         components, layout, styles, pages
│   ├── scripts/     convert.mjs (mirror → JSON), relativize.mjs, check-links.py
│   ├── public/      static assets: images, logo, hero shots
│   └── dist/        the built website  ← this is what you deploy or open
├── redirects.csv    old URL → new URL, 191 rows, for the IT department
└── shots/           screenshots taken during the rebuild
```

## Look at it right now

Double-click **`~/Desktop/unishk-site/web/dist/index.html`**
(or in a terminal: `brave ~/Desktop/unishk-site/web/dist/index.html`).

The build writes **page-relative** asset paths, so the folder works straight
from disk — no server needed — and also works when uploaded to a web root or to
a subdirectory.

`dist/404.html` is the one exception: it keeps root-absolute paths, because a
server serves it at arbitrary URLs.

## Rebuild

```bash
cd ~/Desktop/unishk-site/web
npm install          # once
npm run convert      # re-extract content from ../original into src/data
npm run build        # astro build + relativize  →  dist/
npm run check        # convert + build + broken-link report
```

Each run builds **194 pages** (191 content pages + home + search + 404) in ~4 s.

Live preview while editing: `npm run dev`, or `npm run preview` to serve `dist/`.

## What changed versus the live site

| | Original | Rebuild |
|---|---|---|
| Pages | ~190 core + hundreds of news articles | 191 core pages, article pages link to the live site |
| Weight | jQuery, Bootstrap, Font Awesome, Google-hosted assets, slider scripts | ~20 MB total, no framework JS, self-hosted assets |
| CSS | 2016-era fixed-width theme | modern CSS: layers, custom properties, fluid type, container queries via `clamp()` |
| Mobile | `user-scalable=no`, layout breaks below 992 px | real responsive layout, pinch-zoom allowed, off-canvas menu |
| Navigation | hover-only dropdowns, mouse-only | keyboard operable, `aria-expanded`, Escape closes, focus visible |
| Accessibility | tiny tap targets, no skip link, low contrast | skip link, focus rings, 44 px targets, semantic landmarks, reduced-motion support |
| Dark mode | none | **light by default**; optional dark theme from the header toggle, remembered per browser |
| Search | TYPO3 plugin on the live server | local client-side search at `/kerko`, no server, no tracking |
| Tables | overflowed the page | wrapped in a scroll container |
| PDFs | served from `/fileadmin` | left on the live site, links open `unishk.edu.al` with `↗` |
| Print | unusable | dedicated print stylesheet |

Content, wording and the brand palette (navy `#09375c`, teal `#037f9c`) are the
university's own — only the presentation changed.

## Content notes

- **Images** (13 MB) are copied into the build. **PDFs are not** — the 600 MB of
  documents stay on the live server and are linked with an external marker. The
  mirror still holds local copies if a future version wants to host them.
- **News and activity articles** were deliberately not rebuilt; those cards link
  to the live articles on `unishk.edu.al`.
- **10 rectorate pages** are genuinely empty upstream and show an
  “in preparation” state instead of a blank page.
- Small fixes applied while converting: heading levels rescaled to a sane
  hierarchy, paragraph-length headings demoted to paragraphs, empty wrapper
  `div`s and TYPO3 comment noise dropped, pagination reduced to first/last plus
  neighbours.

## Handing it to IT

Upload the contents of `web/dist/` to any static host. There is no server-side
code, no database and no build step required on their side.

1. **URLs.** Page paths match the old site's structure, but the new build uses
   directory URLs (`/njoftime/`) instead of TYPO3's `.html` files
   (`/njoftime.html`). `redirects.csv` lists every mapping; a redirect block is
   enough to keep old links and search results working:

   ```nginx
   # nginx
   error_page 404 /404.html;
   location / { try_files $uri $uri/ $uri.html =404; }
   ```

   ```apache
   # .htaccess
   ErrorDocument 404 /404.html
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME}.html -f
   RewriteRule ^(.*)$ /$1.html [L]
   ```

2. **Subdirectory-safe.** Every internal link and asset is relative, so the site
   can also live at `https://example.org/new-site/` without changes.

3. **Language.** Content is Albanian (`lang="sq"`). The English version of the
   live site was out of scope; the language menu points at `unishk.edu.al/en/`.

4. **Caching.** Fingerprinted assets live under `/_astro/` and can be cached
   forever; HTML should be revalidated.

## Known gaps

- No English translation of the rebuilt pages (the old English site is a
  separate tree that was not mirrored).
- Article pages, documents and image-heavy galleries link to the live site.
- Search indexes titles and body text of the 191 rebuilt pages only.

## Credits

Design and rebuild: **Ardison Syla** — [sonisyla.com](https://sonisyla.com).
Content, images and brand identity belong to Universiteti i Shkodrës “Luigj Gurakuqi”.
