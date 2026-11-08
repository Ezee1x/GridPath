import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const out = (path) => fileURLToPath(new URL(path, import.meta.url));
const source = await readFile(new URL("../src/app/icon.svg", import.meta.url));
for (const size of [192, 512])
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(
      out(`../public/projectsync-icon-${size}.png`),
    );
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
const socialImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="0.8" cy="0.2" r="0.7"><stop offset="0" stop-color="#4d8bff" stop-opacity="0.6"/><stop offset="1" stop-color="#071a4a" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="#071a4a"/><rect width="1200" height="630" fill="url(#g)"/><g transform="translate(96 92) scale(2.25)"><rect width="32" height="32" rx="7" fill="#c8f03c"/><path d="M9 9h14v10l-4 4H9V9Zm7 7 9 9M9 16h7V9" fill="none" stroke="#071a4a" stroke-width="1.8"/></g><text x="186" y="140" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#ffffff">ProjectSync</text><g font-family="Arial Black,Arial,sans-serif" font-weight="900" fill="#ffffff"><text x="96" y="318" font-size="72">Know the site before</text><text x="96" y="404" font-size="72">the site visit.</text></g><text x="96" y="474" font-family="Arial,sans-serif" font-size="26" fill="#d3e0ff">Site evidence and annotations for battery storage in Massachusetts</text><rect x="96" y="520" width="190" height="52" rx="26" fill="#c8f03c"/><text x="122" y="554" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#071a4a">Add a site</text><text x="1104" y="556" text-anchor="end" font-family="Arial,sans-serif" font-size="18" fill="#9fb4e6">Prototype for EQORE · MIT Energy &amp; Climate Hack 2026</text></svg>`;
await sharp(Buffer.from(socialImage))
  .png()
  .toFile(out("../src/app/opengraph-image.png"));
