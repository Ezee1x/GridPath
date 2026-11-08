import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
const source = await readFile(new URL("../src/app/icon.svg", import.meta.url));
for (const size of [192, 512])
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(
      new URL(`../public/projectsync-icon-${size}.png`, import.meta.url)
        .pathname,
    );
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile(new URL("../src/app/apple-icon.png", import.meta.url).pathname);
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
const socialImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fafaf8"/><rect x="64" y="64" width="1072" height="502" rx="8" fill="white" stroke="#e2e6e1"/><path d="M96 356H1104" stroke="#e2e6e1"/><g transform="translate(108 115) scale(2.5)"><rect width="32" height="32" rx="5" fill="#202522"/><path d="M9 9h14v10l-4 4H9V9Zm7 7 9 9M9 16h7V9" fill="none" stroke="white" stroke-width="1.6"/></g><g font-family="Arial,sans-serif" fill="#202522"><text x="212" y="147" font-size="24" font-weight="600">QORE</text><text x="212" y="192" font-size="42">ProjectSync</text><text x="108" y="291" font-size="43">Engineering site intake. Traceable evidence.</text><text x="108" y="409" font-size="25" fill="#69716c">Site Data Intelligence for EQORE</text><text x="108" y="474" font-size="20" fill="#69716c">Team-built prototype · MIT Energy &amp; Climate Hack 2026</text></g></svg>`;
await sharp(Buffer.from(socialImage))
  .png()
  .toFile(new URL("../src/app/opengraph-image.png", import.meta.url).pathname);
