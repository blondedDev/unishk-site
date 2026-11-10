/**
 * Every converted page as an object. Kept in its own module so the route's
 * hoisted getStaticPaths() can rely on it — a glob inlined in the .astro file
 * gets tree-shaken out of that evaluation context.
 */
const modules = import.meta.glob('../data/pages/*.json', { eager: true, import: 'default' })

const pages = Object.values(modules).sort((a, b) => a.path.localeCompare(b.path, 'sq'))

export default pages
