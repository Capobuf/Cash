import { Buffer } from "node:buffer"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import process from "node:process"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const sourcePath = resolve(scriptDirectory, "../src/renderer/assets/logo-dark.svg")
const outputPath = resolve(scriptDirectory, "../src/renderer/assets/app-icon.ico")
const sizes = [16, 24, 32, 48, 64, 128, 256]
const browserPaths = [
  join(process.env.ProgramFiles ?? "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
  join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
]

function createIco(pngs) {
  const headerSize = 6 + pngs.length * 16
  const directory = Buffer.alloc(headerSize)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(pngs.length, 4)

  let offset = headerSize
  pngs.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    directory.writeUInt8(size === 256 ? 0 : size, entry)
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })

  return Buffer.concat([directory, ...pngs.map(({ png }) => png)])
}

function pngSize(png) {
  if (png.toString("ascii", 1, 4) !== "PNG") throw new Error("Il browser non ha prodotto un PNG valido.")
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

const browserPath = browserPaths.find(existsSync)
if (!browserPath) throw new Error("Chrome o Microsoft Edge sono necessari per rigenerare l'icona Windows.")

const temporaryRoot = resolve(tmpdir())
const temporaryDirectory = mkdtempSync(join(temporaryRoot, "cash-icon-"))
try {
  const svg = readFileSync(sourcePath, "utf8")
  const htmlPath = join(temporaryDirectory, "icon.html")
  const html = `<!doctype html><html><head><style>html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}body{display:grid;place-items:center;background:#171616;border-radius:22%}svg{display:block;width:82%;height:82%}</style></head><body>${svg}</body></html>`
  writeFileSync(htmlPath, html)

  const pngs = sizes.map((size) => {
    const pngPath = join(temporaryDirectory, `icon-${size}.png`)
    const result = spawnSync(browserPath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      `--window-size=${size},${size}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ], { stdio: "pipe" })
    if (result.status !== 0 || !existsSync(pngPath)) {
      throw new Error(result.stderr.toString() || `Impossibile generare l'icona ${size}x${size}.`)
    }
    const png = readFileSync(pngPath)
    const dimensions = pngSize(png)
    if (dimensions.width !== size || dimensions.height !== size) {
      throw new Error(`Dimensione PNG inattesa: ${dimensions.width}x${dimensions.height}, attesa ${size}x${size}.`)
    }
    return { size, png }
  })

  writeFileSync(outputPath, createIco(pngs))
  process.stdout.write(`Icona generata: ${outputPath} (${sizes.join(", ")} px)\n`)
} finally {
  if (dirname(temporaryDirectory) === temporaryRoot && basename(temporaryDirectory).startsWith("cash-icon-")) {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}
