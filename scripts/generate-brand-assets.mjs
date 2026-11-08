import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const out = (path) => fileURLToPath(new URL(path, import.meta.url));
const source = await readFile(new URL("../src/app/icon.svg", import.meta.url));
for (const size of [192, 512])
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(out(`../public/qoresites-icon-${size}.png`));
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile(out("../src/app/apple-icon.png"));
const png = await sharp(source).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(
  new URL("../src/app/favicon.ico", import.meta.url),
  Buffer.concat([header, png]),
);
const wordmark = await readFile(new URL("../public/qoresites-logo.png", import.meta.url));
const socialImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fafaf8"/><rect x="64" y="64" width="1072" height="502" rx="8" fill="white" stroke="#e2e6e1"/><path d="M96 356H1104" stroke="#e2e6e1"/><image x="108" y="111" width="650" height="128" href="data:image/png;base64,${wordmark.toString("base64")}"/><g font-family="Arial,sans-serif" fill="#28594f"><text x="108" y="306" font-size="43">Site intelligence for battery storage.</text><text x="108" y="409" font-size="25" fill="#69716c">Automated site data collection and engineering intake.</text><text x="108" y="474" font-size="20" fill="#69716c">Built for EQORE · MIT Energy &amp; Climate Hack 2026</text></g></svg>`;
await sharp(Buffer.from(socialImage))
  .png()
  .toFile(out("../src/app/opengraph-image.png"));
