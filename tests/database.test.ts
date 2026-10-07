import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const note = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
async function asUser(id: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
});
afterAll(async () => {
  await db?.close();
});
describe("database access and conflict behavior", () => {
  it("saves a private note with canonical multi-verse references", async () => {
    await asUser(alice);
    const result = await db.query<{ version: number; user_id: string }>(
      `select * from public.save_note($1,'JHN',3,array[16,17],'KJV','A private reflection',0)`,
      [note],
    );
    expect(result.rows[0].user_id).toBe(alice);
    expect(result.rows[0].version).toBe(1);
  });
  it("another account cannot read, edit, delete, or impersonate its owner", async () => {
    await asUser(bob);
    expect(
      (await db.query("select * from public.study_items")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "delete from public.study_items where id=$1 returning id",
          [note],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `insert into public.study_items(user_id,kind,book,chapter,verses,translation) values ($1,'bookmark','GEN',1,array[1],'KJV')`,
        [alice],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(
        `select * from public.save_note($1,'JHN',3,array[16,17],'KJV','Intrusion',1)`,
        [note],
      ),
    ).rejects.toThrow(/NOTE_CONFLICT/);
  });
  it("detects stale saves and supports preserving a copy", async () => {
    await asUser(alice);
    const saved = await db.query<{ version: number }>(
      `select * from public.save_note($1,'JHN',3,array[16,17],'KJV','Updated on another device',1)`,
      [note],
    );
    expect(saved.rows[0].version).toBe(2);
    await expect(
      db.query(
        `select * from public.save_note($1,'JHN',3,array[16,17],'KJV','Stale local draft',1)`,
        [note],
      ),
    ).rejects.toThrow(/NOTE_CONFLICT/);
    const copy = await db.query<{ body: string }>(
      `select * from public.save_note(gen_random_uuid(),'JHN',3,array[16,17],'KJV','Stale local draft',0)`,
    );
    expect(copy.rows[0].body).toBe("Stale local draft");
  });
  it("atomically applies, recolors, and removes highlights independently of bookmarks", async () => {
    await asUser(alice);
    await db.query(
      `select public.set_annotations('highlight','JHN',3,array[16,17],'KJV','sage',false)`,
    );
    await db.query(
      `select public.set_annotations('bookmark','JHN',3,array[16],'NIV',null,false)`,
    );
    await db.query(
      `select public.set_annotations('highlight','JHN',3,array[16,17],'ESV','gold',false)`,
    );
    expect(
      (
        await db.query(
          `select * from public.study_items where kind='highlight' and color='gold'`,
        )
      ).rows,
    ).toHaveLength(2);
    await db.query(
      `select public.set_annotations('highlight','JHN',3,array[16,17],'ESV',null,true)`,
    );
    expect(
      (
        await db.query(
          `select * from public.study_items where kind='highlight'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select * from public.study_items where kind='bookmark'`))
        .rows,
    ).toHaveLength(1);
  });
  it("enforces passage bounds and rolls back malformed writes", async () => {
    await asUser(alice);
    await expect(
      db.query(
        `select public.set_annotations('highlight','GEN',99,array[1],'KJV','sage',false)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `select public.set_annotations('highlight','GEN',1,array[1,2],'KJV','invalid',false)`,
      ),
    ).rejects.toThrow();
    expect(
      (await db.query(`select * from public.study_items where book='GEN'`))
        .rows,
    ).toHaveLength(0);
  });
  it("isolates reading preferences and denies anonymous library access", async () => {
    await asUser(alice);
    await db.query(
      `insert into public.reading_preferences(user_id,book,chapter,translation,font_size) values ($1,'PSA',23,'KJV',24)`,
      [alice],
    );
    await asUser(bob);
    expect(
      (await db.query("select * from public.reading_preferences")).rows,
    ).toHaveLength(0);
    await db.exec("reset role;set role anon;");
    await expect(db.query("select * from public.study_items")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("accepts free editions without relabeling legacy study records", async () => {
    await asUser(alice);
    for (const translation of ["WEB", "ASV"]) {
      const saved = await db.query<{ translation: string }>(
        `select * from public.save_note(gen_random_uuid(),'PSA',23,array[1],$1,'Free edition note',0)`,
        [translation],
      );
      expect(saved.rows[0].translation).toBe(translation);
      await db.query(
        `update public.reading_preferences set translation=$1 where user_id=$2`,
        [translation, alice],
      );
    }
    const legacy = await db.query<{ translation: string }>(
      `select translation from public.study_items where kind='bookmark'`,
    );
    expect(legacy.rows[0].translation).toBe("NIV");
  });
});

describe("chapter reading progress", () => {
  it("saves once, validates the canon and supports undo", async () => {
    await asUser(alice);
    for (let i = 0; i < 2; i++)
      await db.query(
        "insert into public.chapter_progress(book,chapter) values ('GEN',1) on conflict (user_id,book,chapter) do nothing",
      );
    expect(
      (await db.query("select * from public.chapter_progress")).rows,
    ).toHaveLength(1);
    for (const [book, chapter] of [
      ["GEN", 51],
      ["XXX", 1],
      ["REV", 0],
    ]) {
      await expect(
        db.query(
          "insert into public.chapter_progress(book,chapter) values ($1,$2)",
          [book, chapter],
        ),
      ).rejects.toThrow(/valid_chapter/);
    }
    await db.query(
      "delete from public.chapter_progress where book='GEN' and chapter=1",
    );
    expect(
      (await db.query("select * from public.chapter_progress")).rows,
    ).toHaveLength(0);
    await db.query(
      "insert into public.chapter_progress(book,chapter) values ('REV',22)",
    );
  });
  it("isolates accounts and rejects ownership reassignment and anonymous access", async () => {
    await asUser(bob);
    expect(
      (await db.query("select * from public.chapter_progress")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from public.chapter_progress returning book"))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.chapter_progress(user_id,book,chapter) values ($1,'GEN',1)",
        [alice],
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(alice);
    await expect(
      db.query("update public.chapter_progress set user_id=$1", [bob]),
    ).rejects.toThrow(/row-level security/);
    await db.exec("reset role; set role anon;");
    await expect(
      db.query("select * from public.chapter_progress"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query(
        "insert into public.chapter_progress(book,chapter) values ('GEN',1)",
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role;");
  });
});
