import { defineConfig } from 'astro/config'

// Static output: no server, no runtime. `npm run build` writes plain HTML/CSS/JS
// to dist/, which can be opened from disk or dropped on any web host.
export default defineConfig({
  site: 'https://unishk.edu.al',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
    format: 'directory',
  },
  devToolbar: { enabled: false },
})
