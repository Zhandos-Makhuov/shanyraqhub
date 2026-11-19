#!/usr/bin/env python3
"""Apply the repository's migrations (and optionally the seed) to a Supabase project via the Management API.

  SUPABASE_PROJECT_REF=<ref> python3 scripts/apply-migrations.py            # pending migrations only
  SUPABASE_PROJECT_REF=<ref> python3 scripts/apply-migrations.py --seed     # + reference data (idempotent)

* Each migration runs in its own transaction and is recorded in supabase_migrations.schema_migrations
  with the version from the file name (the table the Supabase CLI uses), so `supabase db push` /
  `migration list` stay in sync with the repository. Already recorded versions are skipped.
* Nothing is dropped or reset. Run `python3 supabase/tests/run-cloud.py dryrun` first (rolled back).
* Auth: the Management API token is injected by the environment proxy (never put it in code).
"""
import glob, json, os, subprocess, sys

REF = os.environ.get("SUPABASE_PROJECT_REF") or sys.exit("set SUPABASE_PROJECT_REF")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"


def q(sql, read_only=False):
    out = subprocess.run(["curl", "-sS", "-X", "POST", URL, "-H", "Content-Type: application/json", "-d", "@-"],
                         input=json.dumps({"query": sql, "read_only": read_only}), capture_output=True, text=True, check=True).stdout
    res = json.loads(out)
    if isinstance(res, dict) and "message" in res:
        raise RuntimeError(res["message"])
    return res


lit = lambda s: "'" + s.replace("'", "''") + "'"
HISTORY = """create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
"""

exists = q("select to_regclass('supabase_migrations.schema_migrations') is not null as e", True)[0]["e"]
done = set(q("select coalesce(array_agg(version), '{}') as v from supabase_migrations.schema_migrations", True)[0]["v"]) if exists else set()

for path in sorted(glob.glob(os.path.join(ROOT, "supabase", "migrations", "*.sql"))):
    version, name = os.path.basename(path)[:-4].split("_", 1)
    if version in done:
        print("skip (already applied)", version, name)
        continue
    body = open(path, encoding="utf-8").read()
    q("begin;\n" + HISTORY + body + "\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) "
      f"values ({lit(version)}, {lit(name)}, array[{lit(body)}]);\ncommit;\n")
    print("applied", version, name)

if "--seed" in sys.argv:
    q("begin;\n" + open(os.path.join(ROOT, "supabase", "seed.sql"), encoding="utf-8").read() + "\ncommit;\n")
    print("seed applied (reference data, idempotent)")
print(q("select version, name from supabase_migrations.schema_migrations order by 1", True))
