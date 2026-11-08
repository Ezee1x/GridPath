import { DatabaseSync } from "node:sqlite";
import { mkdir, cp, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
const data = path.resolve(process.env.QORE_DATA_DIR || ".data");
const destination = process.argv[2];
if (!destination) throw Error("Usage: node scripts/backup-workspace.mjs /absolute/new-backup-directory");
const out = path.resolve(destination);
if (out === data || out.startsWith(data + path.sep)) throw Error("Backup destination must be outside the live data directory.");
await mkdir(out, { recursive: false, mode: 0o700 });
const db = new DatabaseSync(path.join(data, "workspace.sqlite"));
try {
 // Consistent SQLite snapshot; blobs are immutable and uploaded before database references are committed.
 db.prepare("VACUUM INTO ?").run(path.join(out, "workspace.sqlite"));
 const snapshot = new DatabaseSync(path.join(out, "workspace.sqlite"), {readOnly:true});
 try {
  await mkdir(path.join(out, "blobs"),{mode:0o700});
  for (const row of snapshot.prepare("SELECT DISTINCT hash FROM documents").all()) {
   if (!/^[a-f0-9]{64}$/.test(row.hash)) throw Error("Invalid blob hash in database.");
   await cp(path.join(data,"blobs",row.hash),path.join(out,"blobs",row.hash));
  }
 } finally { snapshot.close(); }
 await writeFile(path.join(out,"backup.json"),JSON.stringify({createdAt:new Date().toISOString(),format:"qore-workspace-backup",version:1,blobCount:(await readdir(path.join(out,"blobs"))).length},null,2),{mode:0o600});
 console.log(`Workspace backup created: ${out}`);
} finally { db.close(); }
