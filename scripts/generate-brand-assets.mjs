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
const socialImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#ffffff"/><rect x="0" y="560" width="1200" height="70" fill="#f3f6fa"/><path d="M0 560H1200" stroke="#d6dee8"/><g transform="translate(96 96) scale(2.25)"><rect width="32" height="32" rx="5" fill="#2b5c93"/><path d="M9 9h14v10l-4 4H9V9Zm7 7 9 9M9 16h7V9" fill="none" stroke="white" stroke-width="1.6"/></g><text x="186" y="140" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#2b5c93">QORE</text><text x="268" y="140" font-family="Georgia,serif" font-size="36" fill="#12233d">ProjectSync</text><g font-family="Georgia,serif" fill="#12233d"><text x="96" y="300" font-size="68">Know the site before</text><text x="96" y="384" font-size="68">the site visit.</text></g><g font-family="Arial,sans-serif" fill="#4d5f78"><text x="96" y="456" font-size="26">Site evidence and annotations for battery storage in Massachusetts</text><text x="96" y="604" font-size="20">Prototype for EQORE · MIT Energy &amp; Climate Hack 2026</text></g></svg>`;
await sharp(Buffer.from(socialImage))
  .png()
  .toFile(out("../src/app/opengraph-image.png"));
