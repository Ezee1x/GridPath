import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  loadIntake,
  reviewField,
  selectedObservation,
  INTAKE_STORAGE,
} from "../intake/model";
import type { IntakeRecord } from "../intake/types";
export type TeamRole = "admin" | "engineer" | "editor" | "viewer";
export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
}
export class TeamError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const hash = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
const passwordHash = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString("hex");
export function createTeamRepository(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const blobs = path.join(directory, "blobs");
  mkdirSync(blobs, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "workspace.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,password TEXT,salt TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),expires INTEGER);
    CREATE TABLE IF NOT EXISTS records(kind TEXT,key TEXT,version INTEGER,payload TEXT,updatedAt TEXT,actor TEXT,PRIMARY KEY(kind,key));
    CREATE TABLE IF NOT EXISTS documents(key TEXT PRIMARY KEY,siteKey TEXT,hash TEXT,name TEXT,type TEXT,size INTEGER,actor TEXT,createdAt TEXT);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT,actor TEXT,action TEXT,recordKey TEXT,details TEXT);
    CREATE TABLE IF NOT EXISTS attempts(email TEXT PRIMARY KEY,count INTEGER,until INTEGER);`);
  if (
    !db
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((c) => c.name === "disabled")
  )
    db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0");
  const userFields = "id,email,name,role";
  const audit = (actor: string, action: string, key: string, details = "") =>
    db
      .prepare(
        "INSERT INTO audit(at,actor,action,recordKey,details) VALUES(?,?,?,?,?)",
      )
      .run(new Date().toISOString(), actor, action, key, details);
  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function addUser(
    input: { email: string; name: string; password: string; role: TeamRole },
    actor?: TeamUser,
  ) {
    if (actor && actor.role !== "admin")
      throw new TeamError(
        "Only an administrator can create team members.",
        403,
      );
    const email = input.email?.trim().toLowerCase();
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !input.name?.trim() ||
      input.name.length > 100 ||
      !input.password ||
      input.password.length < 12 ||
      input.password.length > 200 ||
      !["admin", "engineer", "editor", "viewer"].includes(input.role)
    )
      throw new TeamError(
        "Enter a valid email, name, role and password of at least 12 characters.",
      );
    const id = randomUUID(),
      salt = randomBytes(24).toString("hex");
    try {
      db.prepare(
        "INSERT INTO users(id,email,name,role,password,salt) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        email,
        input.name.trim(),
        input.role,
        passwordHash(input.password, salt),
        salt,
      );
    } catch {
      throw new TeamError("That email already has an account.", 409);
    }
    audit(actor?.id ?? id, "account-created", id, input.role);
    return { id, email, name: input.name.trim(), role: input.role } as TeamUser;
  }
  function login(emailInput: string, password: string) {
    const email = String(emailInput).trim().toLowerCase();
    const attempts = db
      .prepare("SELECT count,until FROM attempts WHERE email=?")
      .get(email) as { count: number; until: number } | undefined;
    if (attempts && attempts.until > Date.now() && attempts.count >= 10)
      throw new TeamError("Too many attempts. Try again in 15 minutes.", 429);
    const row = db
      .prepare("SELECT * FROM users WHERE email=? AND disabled=0")
      .get(email) as
      (TeamUser & { password: string; salt: string }) | undefined;
    const actual = passwordHash(
      String(password).slice(0, 201),
      row?.salt ?? "constant-missing-user-salt",
    );
    if (
      !row ||
      !timingSafeEqual(
        Buffer.from(actual, "hex"),
        Buffer.from(row.password, "hex"),
      )
    ) {
      db.prepare(
        "INSERT INTO attempts VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET count=excluded.count,until=excluded.until",
      ).run(
        email,
        attempts && attempts.until > Date.now() ? attempts.count + 1 : 1,
        Date.now() + 900000,
      );
      throw new TeamError("Email or password is incorrect.", 401);
    }
    db.prepare("DELETE FROM attempts WHERE email=?").run(email);
    const token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      row.id,
      Date.now() + 7 * 86400000,
    );
    audit(row.id, "signed-in", row.id);
    return {
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
      token,
    };
  }
  function authenticate(token: string | undefined) {
    if (!token) throw new TeamError("Sign in to the shared workspace.", 401);
    const row = db
      .prepare(
        `SELECT ${userFields
          .split(",")
          .map((x) => `u.${x}`)
          .join(
            ",",
          )} FROM sessions s JOIN users u ON s.userId=u.id WHERE s.token=? AND s.expires>? AND u.disabled=0`,
      )
      .get(hash(token), Date.now()) as unknown as TeamUser | undefined;
    if (!row) throw new TeamError("Your session expired. Sign in again.", 401);
    return row;
  }
  function save(
    user: TeamUser,
    kind: string,
    key: string,
    payload: unknown,
    baseVersion: number,
  ) {
    if (user.role === "viewer")
      throw new TeamError("Viewers cannot change shared records.", 403);
    if (
      !["site", "engineering"].includes(kind) ||
      typeof key !== "string" ||
      key.length > 600 ||
      JSON.stringify(payload).length > 6_000_000 ||
      !Number.isInteger(baseVersion) ||
      baseVersion < 0
    )
      throw new TeamError("Invalid record or version.");
    return transaction(() => {
      const previous = db
        .prepare("SELECT * FROM records WHERE kind=? AND key=?")
        .get(kind, key) as { version: number; payload: string } | undefined;
      if ((previous?.version ?? 0) !== baseVersion)
        throw new TeamError(
          "A teammate changed this record. Download your local package, then pull the latest shared copy before retrying.",
          409,
        );
      let value = payload;
      if (kind === "engineering") {
        const r = loadIntake(
          {
            getItem: (k) =>
              k === INTAKE_STORAGE + key ? JSON.stringify(payload) : null,
          },
          key,
        )!;
        const old: IntakeRecord | undefined = previous
          ? JSON.parse(previous.payload)
          : undefined;
        r.fields = r.fields.map((field) => {
          const prior = old?.fields.find((f) => f.id === field.id);
          if (
            JSON.stringify(field.review) === JSON.stringify(prior?.review) &&
            field.selectedId === prior?.selectedId &&
            field.review.attribution &&
            JSON.stringify(selectedObservation(field)) ===
              JSON.stringify(prior && selectedObservation(prior)) &&
            (selectedObservation(field)?.sourceKeys ?? []).every(
              (k) =>
                JSON.stringify(r.sources[k]) ===
                JSON.stringify(old?.sources[k]),
            )
          )
            return field;
          if (field.review.status === "Engineer verified") {
            if (!["admin", "engineer"].includes(user.role))
              throw new TeamError(
                "An engineer or administrator must perform verification.",
                403,
              );
            const validated = reviewField(
              r,
              field.id,
              user.name,
              field.review.note,
            ).fields.find((f) => f.id === field.id)!;
            return {
              ...field,
              review: {
                ...validated.review,
                attribution: {
                  userId: user.id,
                  name: user.name,
                  email: user.email,
                  at: new Date().toISOString(),
                  workspace: "shared" as const,
                },
              },
            };
          }
          return {
            ...field,
            review: { ...field.review, attribution: undefined },
          };
        });
        value = r;
      } else {
        const site = payload as {
          id?: string;
          mapPlaceId?: string;
          parcelFeatureId?: string | null;
        };
        if (site.id !== key || typeof site.id !== "string")
          throw new TeamError("Site identity does not match.");
      }
      const version = baseVersion + 1;
      db.prepare(
        "INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET version=excluded.version,payload=excluded.payload,updatedAt=excluded.updatedAt,actor=excluded.actor",
      ).run(
        kind,
        key,
        version,
        JSON.stringify(value),
        new Date().toISOString(),
        user.id,
      );
      audit(user.id, `${kind}-saved`, key, `version ${version}`);
      return { version, payload: value };
    });
  }
  return {
    db,
    changePassword: (
      user: TeamUser,
      oldPassword: string,
      newPassword: string,
    ) => {
      const row = db
        .prepare("SELECT password,salt FROM users WHERE id=?")
        .get(user.id)!;
      if (
        !timingSafeEqual(
          Buffer.from(
            passwordHash(String(oldPassword), String(row.salt)),
            "hex",
          ),
          Buffer.from(String(row.password), "hex"),
        )
      )
        throw new TeamError("Current password is incorrect.", 403);
      if (
        typeof newPassword !== "string" ||
        newPassword.length < 12 ||
        newPassword.length > 200
      )
        throw new TeamError("New password must contain 12–200 characters.");
      const salt = randomBytes(24).toString("hex");
      db.prepare("UPDATE users SET password=?,salt=? WHERE id=?").run(
        passwordHash(newPassword, salt),
        salt,
        user.id,
      );
      db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
      audit(user.id, "password-changed", user.id);
      return { ok: true };
    },
    disableUser: (user: TeamUser, email: string) => {
      if (user.role !== "admin")
        throw new TeamError("Administrator access required.", 403);
      const target = db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(String(email).trim().toLowerCase());
      if (!target || target.id === user.id)
        throw new TeamError("Choose another existing team member.");
      db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(target.id);
      db.prepare("DELETE FROM sessions WHERE userId=?").run(target.id);
      audit(user.id, "account-disabled", String(target.id));
      return { ok: true };
    },
    addUser,
    login,
    authenticate,
    save,
    hasUsers: () => !!db.prepare("SELECT id FROM users LIMIT 1").get(),
    bootstrap: (
      input: Parameters<typeof addUser>[0],
      token: string,
      configuredToken: string | undefined,
    ) =>
      transaction(() => {
        if (
          !configuredToken ||
          token.length !== configuredToken.length ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(configuredToken))
        )
          throw new TeamError("The server setup token is required.", 403);
        if (db.prepare("SELECT id FROM users LIMIT 1").get())
          throw new TeamError("Workspace already initialized.", 409);
        return addUser({ ...input, role: "admin" });
      }),
    logout: (token: string) =>
      db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token)),
    list: () =>
      db
        .prepare("SELECT kind,key,version,payload FROM records")
        .all()
        .map((r) => ({ ...r, payload: JSON.parse(String(r.payload)) })),
    users: (user: TeamUser) => {
      if (user.role !== "admin")
        throw new TeamError("Administrator access required.", 403);
      return db.prepare(`SELECT ${userFields} FROM users`).all();
    },
    audit: (user: TeamUser) => {
      if (!user.id) throw new TeamError("Sign in first.", 401);
      return db
        .prepare(
          "SELECT a.id,a.at,u.name actor,a.action,a.recordKey,a.details FROM audit a LEFT JOIN users u ON a.actor=u.id ORDER BY a.id DESC LIMIT 200",
        )
        .all();
    },
    putFile: (
      user: TeamUser,
      key: string,
      siteKey: string,
      name: string,
      type: string,
      bytes: Uint8Array,
    ) => {
      if (user.role === "viewer")
        throw new TeamError("Viewers cannot upload files.", 403);
      if (!siteKey || siteKey.length > 600 || key.length > 2000)
        throw new TeamError("Invalid file identity.");
      if (
        !key.startsWith(`input:${siteKey}:`) &&
        !key.startsWith(`image:${siteKey}:`)
      )
        throw new TeamError("File belongs to another record.");
      if (
        !name ||
        name.length > 240 ||
        bytes.length === 0 ||
        bytes.length > 50 * 1024 * 1024
      )
        throw new TeamError("File size or name is invalid.");
      const digest = hash(bytes),
        filename = path.join(blobs, digest);
      if (!existsSync(filename)) {
        const temporary = filename + "." + randomUUID();
        writeFileSync(temporary, bytes, { mode: 0o600 });
        renameSync(temporary, filename);
      }
      const old = db.prepare("SELECT hash FROM documents WHERE key=?").get(key);
      if (old && old.hash !== digest)
        throw new TeamError(
          "A different file already uses that reference.",
          409,
        );
      if (old) return { hash: digest, size: bytes.length };
      db.prepare(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(key) DO NOTHING",
      ).run(
        key,
        siteKey,
        digest,
        name,
        type.slice(0, 100),
        bytes.length,
        user.id,
        new Date().toISOString(),
      );
      audit(user.id, "file-uploaded", siteKey, digest);
      return { hash: digest, size: bytes.length };
    },
    files: (siteKey: string) =>
      db
        .prepare(
          "SELECT key,siteKey,hash,name,type,size FROM documents WHERE siteKey=?",
        )
        .all(siteKey),
    file: (key: string) => {
      const row = db.prepare("SELECT * FROM documents WHERE key=?").get(key) as
        | {
            name: string;
            type: string;
            hash: string;
            key: string;
            siteKey: string;
            size: number;
          }
        | undefined;
      if (!row) throw new TeamError("File not found.", 404);
      const bytes = readFileSync(path.join(blobs, String(row.hash)));
      if (hash(bytes) !== row.hash)
        throw new TeamError("Stored file integrity check failed.", 500);
      return { ...row, bytes };
    },
  };
}
let repository: ReturnType<typeof createTeamRepository> | undefined;
export function teamRepository() {
  if (process.env.QORE_TEAM_ENABLED !== "true")
    throw new TeamError(
      "Shared workspace is disabled. Configure QORE_TEAM_ENABLED and a persistent QORE_DATA_DIR on the server.",
      503,
    );
  return (repository ??= createTeamRepository(
    process.env.QORE_DATA_DIR ?? path.join(process.cwd(), ".data"),
  ));
}
