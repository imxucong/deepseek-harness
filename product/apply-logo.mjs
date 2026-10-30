/** Apply the TopAsk master logo to the shipped Web, Desktop, favicon, and installer artwork. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(ROOT, 'apps/desktop/package.json'))
const sharp = require('sharp')

/** Remove trailing whitespace introduced by the source document's indentation. */
function cleanSvg(source) {
  return (typeof source === 'string' ? source : source.toString('utf8')).replaceAll(/[ \t]+$/gmu, '')
}

const LOGO = resolve(ROOT, 'product/assets/topask-logo.svg')
const logoSvg = await readFile(LOGO, 'utf8')
const bubblePath = /<path id="bubbleShape" d="([\s\S]*?)"\s*\/>/u.exec(logoSvg)?.[1]
  ?.replace(/\s+/gu, ' ')
  .trim()
if (bubblePath === undefined) throw new Error('apply-logo: logo SVG has no bubble path')
// Chromium does not resolve the logo's forward `<use>` references while the SVG
// is loaded as an image; inline both references so favicons and generated icons render.
const safeLogoSvg = cleanSvg(logoSvg
  .replace(
    /<clipPath id="bubbleClip">\s*<use href="#bubbleShape"\s*\/>\s*<\/clipPath>/u,
    `<clipPath id="bubbleClip"><path d="${bubblePath}"/></clipPath>`,
  )
  .replace(
    /<use href="#bubbleShape"\s+fill="url\(#bodyGradient\)"\s*\/>/u,
    `<path d="${bubblePath}" fill="url(#bodyGradient)"/>`,
  )
  .replace(/<path id="bubbleShape"[\s\S]*?\/>/u, ''))
const defs = /<defs>([\s\S]*?)<\/defs>/u.exec(safeLogoSvg)?.[1]
const body = /<\/defs>([\s\S]*?)<\/svg>/u.exec(safeLogoSvg)?.[1]?.trim()
if (defs === undefined || body === undefined) throw new Error('apply-logo: logo SVG has no defs or body')

const DESKTOP_ICONS = [
  {
    template: 'product/assets/desktop-icon.svg',
    output: 'apps/desktop/resources/icon.svg',
    group: '<g filter="url(#filter1_ddi_1637_371)">',
  },
  {
    template: 'product/assets/desktop-icon-macos.svg',
    output: 'apps/desktop/resources/icon-macos.svg',
    group: '<g filter="url(#filter1_ddi_1637_371)">',
  },
  {
    template: 'product/assets/desktop-icon-windows.svg',
    output: 'apps/desktop/resources/icon-windows.svg',
    group: '<g id="tray-glyph" filter="url(#filter1_ddi_1637_371)">',
  },
]

const logoGroup = `<g transform="translate(50 42) scale(0.80)">\n${body}\n</g>`

for (const { template, output, group } of DESKTOP_ICONS) {
  let source = await readFile(resolve(ROOT, template), 'utf8')
  if (!source.includes(group)) throw new Error(`apply-logo: ${template} has no artwork group`)
  source = source.replace('</defs>', `${defs}\n</defs>`)
  const start = source.indexOf(group)
  const end = source.indexOf('</g>', start)
  if (end === -1) throw new Error(`apply-logo: ${template} has no artwork group close`)
  source = source.slice(0, start) + `${group}\n${logoGroup}\n</g>` + source.slice(end + 4)
  source = source.replace(
    /<filter id="filter1_ddi_1637_371" x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*"/u,
    '<filter id="filter1_ddi_1637_371" x="100" y="100" width="904" height="904"',
  )
  await writeFile(resolve(ROOT, output), cleanSvg(source))
  console.log(output)
}

await writeFile(resolve(ROOT, 'product/dsh-topask/icon.svg'), safeLogoSvg)
await writeFile(resolve(ROOT, 'product/assets/favicon.svg'), safeLogoSvg)
await writeFile(resolve(ROOT, 'product/assets/favicon-dark.svg'), safeLogoSvg)
console.log('product/dsh-topask/icon.svg')
console.log('product/assets/favicon.svg')
console.log('product/assets/favicon-dark.svg')

async function render(svg, width, height, file) {
  const png = await sharp(Buffer.from(cleanSvg(svg)), { density: 144 })
    .resize(width, height, { kernel: 'lanczos3' })
    .png()
    .toBuffer()
  await writeFile(resolve(ROOT, file), png)
  console.log(file)
}

for (const [sourceFile, outputFile, size] of [
  ['apps/desktop/resources/icon.svg', 'apps/desktop/resources/icon.png', 1104],
  ['apps/desktop/resources/icon-macos.svg', 'apps/desktop/resources/icon-macos.png', 1024],
  ['apps/desktop/resources/icon-windows.svg', 'apps/desktop/resources/icon-windows.png', 1024],
]) {
  await render(await readFile(resolve(ROOT, sourceFile)), size, size, outputFile)
}

const welcome = `<svg width="472" height="40" viewBox="0 0 472 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}</defs>
<g transform="translate(0 0) scale(0.0319)">${body}</g>
<style>
  @media (prefers-color-scheme: dark) { .topask-wordmark { fill: #f9fafb; } }
</style>
<text class="topask-wordmark" x="52" y="29" font-family="Montserrat, 'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="500" letter-spacing="-0.4" fill="#0f1115">TopAsk</text>
</svg>
`
await writeFile(resolve(ROOT, 'apps/desktop/renderer/assets/welcome-brand.svg'), cleanSvg(welcome))
console.log('apps/desktop/renderer/assets/welcome-brand.svg')

function lockup(width, height, dark) {
  const markSize = height * 0.72
  const scale = markSize / 1254
  const textSize = height * 0.38
  const textX = markSize + height * 0.18
  const textY = height / 2 + textSize * 0.35
  return `<svg width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}</defs>
<g transform="translate(0 ${String((height - markSize) / 2)}) scale(${String(scale)})">${body}</g>
<text x="${String(textX)}" y="${String(textY)}" font-family="Montserrat, Arial, sans-serif" font-size="${String(textSize)}" font-weight="500" letter-spacing="-1" fill="${dark ? '#f9fafb' : '#0f1115'}">TopAsk</text>
</svg>
`
}

for (const [file, width, height, dark] of [
  ['apps/desktop/installer/assets/brand.png', 600, 196, false],
  ['apps/desktop/installer/assets/brand-2x.png', 1200, 392, false],
  ['apps/desktop/installer/assets/brand-dark.png', 600, 196, true],
  ['apps/desktop/installer/assets/brand-dark-2x.png', 1200, 392, true],
]) {
  await render(lockup(width, height, dark), width, height, file)
}

const sidebar = `<svg width="164" height="314" viewBox="0 0 164 314" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}</defs>
<g transform="translate(22 97) scale(${String(120 / 1254)})">${body}</g>
</svg>
`
await render(sidebar, 164, 314, 'apps/desktop/installer/assets/uninstaller-sidebar.png')
