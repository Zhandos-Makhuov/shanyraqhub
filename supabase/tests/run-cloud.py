#!/usr/bin/env python3
"""Non-destructive checks against a Supabase project via the Management API.

  python3 supabase/tests/run-cloud.py tests   # security_tests.sql against the APPLIED schema
  python3 supabase/tests/run-cloud.py dryrun  # pending (unrecorded) migrations + seed + tests
  python3 supabase/tests/run-cloud.py lint    # plpgsql_check over public/private (like `supabase db lint`)

Everything runs in ONE transaction that always ends with a deliberate exception, so nothing is
committed: the test users, schema `t`, uploaded storage rows and the plpgsql_check extension are
rolled back. Auth: the Management API token is injected by the environment proxy for
api.supabase.com (never put it in code). Project ref: SUPABASE_PROJECT_REF (default: test project).
Never use run-local.sh against Supabase: it drops a database.
"""
import json, os, re, subprocess, sys
from pathlib import Path

REF = os.environ.get("SUPABASE_PROJECT_REF", "fwhcaspbbktgpjiskpln")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DONE = "SHQ_ROLLBACK_DONE"


def query(sql: str) -> object:
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    out = subprocess.run(["curl", "-sS", "-X", "POST", url, "-H", "Content-Type: application/json", "-d", "@-"],
                         input=json.dumps({"query": sql}), capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def convert_tests() -> str:
    """psql-only syntax -> plain SQL: \\gset vars become set_config('shq.<var>'), PASS lines bump a counter."""
    out = []
    for line in (HERE / "security_tests.sql").read_text().splitlines():
        # Non-empty project: "the first reply" must be the reply of the test's own topic.
        line = line.replace("select id as reply from public.forum_replies limit 1 \\gset",
                            "select id as reply from public.forum_replies where topic_id = :'topic' limit 1 \\gset")
        if re.match(r"^\\(set|echo)\b", line):
            continue
        m = re.match(r"^select (.*) as (\w+)( from .*)? \\gset$", line)
        if m:
            expr, var, rest = m.group(1), m.group(2), m.group(3) or ""
            line = f"select set_config('shq.{var}', s.{var}::text, false) from (select {expr} as {var}{rest}) s;"
        if "\\gset" in line:
            sys.exit(f"cannot convert: {line}")
        # report_content takes target_id as text; everywhere else a bare id variable is a uuid.
        line = line.replace("report_content('forum_topic', :'topic',", "report_content('forum_topic', current_setting('shq.topic'),")

        def var_ref(m, line=line):
            var, cs = m.group(2), f"current_setting('shq.{m.group(2)}')"
            in_concat = line[:m.start()].rstrip().endswith("||") or line[m.end():].lstrip().startswith("||")
            return m.group(1) + cs + ("" if var in ("tok", "tok2", "cheap") or in_concat else "::uuid")

        line = re.sub(r"(^|[^:]):'(\w+)'", var_ref, line)
        line = re.sub(r"(?<![:\w]):(m[12]_xp_before)\b", r"current_setting('shq.\1')::int", line)
        line = line.replace("raise notice 'PASS", "perform set_config('shq.passed', (coalesce(nullif("
                            "current_setting('shq.passed', true), ''), '0')::int + 1)::text, false); raise notice 'PASS")
        if line.startswith("delete from storage.objects"):
            # Real Supabase blocks SQL deletes (storage.protect_delete) unless the flag the Storage API
            # sets is on; RLS still decides which rows may be deleted.
            line = "select set_config('storage.allow_delete_query', 'true', true); " + line
        out.append(line)
    sql = "\n".join(out)
    # A non-empty project (e.g. test accounts from earlier stages): absolute row counts become
    # "baseline + N", with the baseline captured at the start of the same (rolled-back) transaction.
    counted = (("public.profiles", "profiles"), ("public.user_balances", "balances"), ("public.member_stats", "stats"),
               ("public.audit_logs where action = 'COIN_ADJUST'", "coin_adjust"))
    for table, key in counted:
        sql = sql.replace(f"(select count(*) from {table}) = ", f"(select count(*) from {table}) - current_setting('shq.base_{key}')::int = ")
    # Memberships are checked as ordinary members, who see every ACTIVE membership: offset by the existing active ones.
    sql = sql.replace("(select count(*) from public.memberships) = ",
                      "(select count(*) from public.memberships) - current_setting('shq.base_active_memberships')::int = ")
    baseline = "".join(f"select set_config('shq.base_{key}', (select count(*) from {table})::text, false);\n" for table, key in counted)
    baseline += "select set_config('shq.base_active_memberships', (select count(*) from public.memberships where status = 'active')::text, false);\n"
    return baseline + sql


LINT = r"""
create extension if not exists plpgsql_check with schema extensions;
do $$ declare r text; begin
  with fns as (
    select p.oid, n.nspname, p.proname,
           case when p.prorettype = 'trigger'::regtype
                then (select t.tgrelid from pg_trigger t where t.tgfoid = p.oid limit 1) else 0 end as rel
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
    where l.lanname = 'plpgsql' and n.nspname in ('public', 'private'))
  select coalesce(string_agg(format('[%s] %s.%s line %s: %s', c.level, f.nspname, f.proname, c.lineno, c.message),
                             E'\n' order by c.level, f.proname), 'no issues') into r
  from fns f cross join lateral extensions.plpgsql_check_function_tb(f.oid, f.rel,
       extra_warnings := true, performance_warnings := true) c
  where f.rel is not null;
  raise exception E'%\n%', 'SHQ_ROLLBACK_DONE', r;
end $$;
"""


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "tests"
    parts = ["begin;"]
    if mode == "dryrun":
        hist = query("select coalesce(array_agg(version), '{}') as v from supabase_migrations.schema_migrations"
                     if query("select to_regclass('supabase_migrations.schema_migrations') is not null as e")[0]["e"]
                     else "select '{}'::text[] as v")
        applied = set(hist[0]["v"])
        pending = [p for p in sorted((ROOT / "migrations").glob("*.sql")) if p.name.split("_", 1)[0] not in applied]
        print("pending migrations:", ", ".join(p.name for p in pending) or "none")
        parts += [p.read_text() for p in pending] + [(ROOT / "seed.sql").read_text()]
    if mode in ("tests", "dryrun"):
        parts += [convert_tests(),
                  f"do $$ begin raise exception '{DONE} passed=%', current_setting('shq.passed', true); end $$;"]
    elif mode == "lint":
        parts.append(LINT)
    else:
        sys.exit(__doc__)
    res = query("\n;\n".join(parts))
    msg = res.get("message", "") if isinstance(res, dict) else ""
    if DONE not in msg:
        sys.exit(f"FAILED (rolled back): {msg or res}")
    print(msg.split(DONE, 1)[1].split("\nCONTEXT:")[0].strip())


if __name__ == "__main__":
    main()
