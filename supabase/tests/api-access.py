#!/usr/bin/env python3
"""Phase 4: direct REST/RPC access checks (what a member can read/write through the API, bypassing the site).

TEST project only (fwhcaspbbktgpjiskpln) — never run against production: it creates a temporary event and
registrations (removed at the end). Needs:
  - .env.local with VITE_SUPABASE_ANON_KEY of the test project (publishable key);
  - SHQ_TEST_PASSWORD = password of the test accounts claude-test@ / claude-org@shanyraq-hub.test (never stored in git);
  - Management API access for SQL setup (the session proxy injects the token; curl only).
Usage: SHQ_TEST_PASSWORD=... python3 supabase/tests/api-access.py
"""
import json, subprocess, sys, os
URL = "https://fwhcaspbbktgpjiskpln.supabase.co"
KEY = [l.split("=",1)[1].strip() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env.local")) if l.startswith("VITE_SUPABASE_ANON_KEY")][0]
PW = os.environ.get("SHQ_TEST_PASSWORD") or sys.exit("set SHQ_TEST_PASSWORD")
P = F = 0
def ok(c, m):
    global P, F
    P += c; F += (not c); print(("PASS " if c else "FAIL ") + m)
def req(method, path, token=None, body=None):
    h = ["-H", f"apikey: {KEY}", "-H", "Content-Type: application/json", "-H", "Prefer: return=representation"]
    h += ["-H", f"Authorization: Bearer {token or KEY}"]
    args = ["curl", "-s", "-o", "/dev/stdout", "-w", "\n%{http_code}", "-X", method, URL + path] + h
    if body is not None: args += ["--data", json.dumps(body)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    txt, code = out.rsplit("\n", 1)
    try: data = json.loads(txt) if txt else None
    except Exception: data = txt
    return int(code), data
def login(email):
    c, d = req("POST", "/auth/v1/token?grant_type=password", body={"email": email, "password": PW})
    return d["access_token"], d["user"]["id"]
sql = lambda q: json.loads(subprocess.run(["curl","-s","-X","POST","https://api.supabase.com/v1/projects/fwhcaspbbktgpjiskpln/database/query","-H","Authorization: Bearer x","-H","Content-Type: application/json","--data",json.dumps({"query":q})],capture_output=True,text=True).stdout)

# setup: a published future event by claude-org with two registrations (claude-test + a TG test member); one cancelled
ORG = "(select id from auth.users where email='claude-org@shanyraq-hub.test')"
import datetime
otok, oid = login("claude-org@shanyraq-hub.test")
c, d = req("POST", "/rest/v1/events", otok, {"title": "API test 4", "direction": "books", "starts_at": (datetime.datetime.now(datetime.UTC).replace(tzinfo=None) + datetime.timedelta(days=2)).isoformat() + "Z", "capacity": 10, "status": "published"})
assert c == 201, (c, d)
ev = d[0]["id"]
ok(d[0]["created_by"] == oid, "organizer creates an event through the API; the author is set by the database")
sql(f"""insert into public.event_registrations (event_id, user_id, status) select '{ev}', id, 'registered' from auth.users where email in ('tg-7000000001@telegram.invalid');
        insert into public.event_registrations (event_id, user_id, status, cancelled_at) select '{ev}', id, 'cancelled', now() from auth.users where email = 'tg-7000000002@telegram.invalid';""")
try:
    # anonymous
    for path in [f"/rest/v1/event_registrations?event_id=eq.{ev}", "/rest/v1/event_attendance?select=*", "/rest/v1/profiles?select=id", "/rest/v1/profile_contacts?select=*", "/rest/v1/reward_ledger?select=*"]:
        c, d = req("GET", path)
        ok(c in (401, 403) or (c == 200 and d == []), f"anon {path.split('?')[0]} → {c} {'(empty)' if d == [] else ''}")
    c, d = req("POST", "/rest/v1/rpc/get_member_stats", body={})
    ok(c in (401, 403, 404), f"anon get_member_stats → {c}")
    # member
    tok, me = login("claude-test@shanyraq-hub.test")
    c, d = req("POST", "/rest/v1/rpc/register_for_event", tok, {"p_event": ev})
    ok(c == 200, f"member registers through the RPC → {c}")
    c, d = req("GET", f"/rest/v1/event_registrations?event_id=eq.{ev}&select=user_id,status", tok)
    ok(c == 200 and len(d) == 2 and all(r["status"] == "registered" for r in d), f"C-21: member sees who registered (2 active, cancelled hidden): {len(d) if isinstance(d, list) else d}")
    c, d = req("GET", f"/rest/v1/event_registrations?event_id=eq.{ev}&status=eq.cancelled", tok)
    ok(c == 200 and d == [], "C-21: someone else's cancelled registration is not readable")
    c, d = req("GET", "/rest/v1/event_attendance?select=user_id&user_id=neq." + me, tok)
    ok(c == 200 and d == [], f"who came (others) stays private → {len(d) if isinstance(d, list) else d}")
    other = sql("select id from auth.users where email='tg-7000000001@telegram.invalid'")[0]["id"]
    c, d = req("PATCH", f"/rest/v1/event_registrations?event_id=eq.{ev}&user_id=eq.{other}", tok, {"status": "cancelled"})
    ok(c in (401, 403), f"member cannot change someone else's registration → {c}")
    c, d = req("DELETE", f"/rest/v1/event_registrations?event_id=eq.{ev}&user_id=eq.{other}", tok)
    ok(c in (401, 403), f"member cannot delete someone else's registration → {c}")
    c, d = req("POST", "/rest/v1/event_registrations", tok, {"event_id": ev, "user_id": other, "status": "registered"})
    ok(c in (401, 403), f"member cannot insert a registration for someone else → {c}")
    c, d = req("GET", f"/rest/v1/profile_contacts?user_id=eq.{other}", tok)
    ok(c == 200 and d == [], "another member's phone is not readable")
    c, d = req("GET", f"/rest/v1/reward_ledger?user_id=eq.{other}", tok)
    ok(c == 200 and d == [], "another member's coin history is not readable")
    c, d = req("GET", f"/rest/v1/notifications?user_id=eq.{other}", tok)
    ok(c == 200 and d == [], "another member's notifications are not readable")
    c, d = req("GET", f"/rest/v1/user_preferences?user_id=eq.{other}", tok)
    ok(c == 200 and d == [], "another member's settings are not readable")
    c, d = req("PATCH", f"/rest/v1/user_balances?user_id=eq.{me}", tok, {"coins": 99999})
    ok(c in (401, 403), f"member cannot change own balance → {c}")
    c, d = req("POST", "/rest/v1/reward_ledger", tok, {"user_id": me, "xp_delta": 1000, "coin_delta": 1000, "source": "admin_adjustment", "reason": "x", "idempotency_key": "x"})
    ok(c in (401, 403), f"member cannot write the reward ledger → {c}")
    c, d = req("PATCH", f"/rest/v1/user_roles?user_id=eq.{me}", tok, {"role": "admin"})
    ok(c in (401, 403), f"member cannot raise own role → {c}")
    for fn, body in [("manual_check_in", {"p_event": ev, "p_user": me, "p_reason": "x"}), ("undo_check_in", {"p_event": ev, "p_user": other, "p_reason": "x"}),
                     ("admin_adjust_coins", {"p_user": me, "p_amount": 100, "p_reason": "x"}), ("set_user_role", {"p_user": me, "p_role": "admin"}),
                     ("award_achievement", {"p_user": me, "p_achievement": "ach-tarlan-runner", "p_note": "x"})]:
        c, d = req("POST", f"/rest/v1/rpc/{fn}", tok, body)
        ok(c in (400, 401, 403) and "forbidden" in json.dumps(d), f"member cannot call {fn} → {c}")
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", tok, {"title": "hacked"})
    ok((c == 200 and d == []) or c in (401, 403), f"member cannot edit someone's event → {c} {d}")
    c, d = req("POST", "/rest/v1/rpc/get_event_counts", tok, {"p_events": [ev]})
    ok(c == 200 and d[0]["registered"] == 2, f"public counts: registered={d[0]['registered'] if c == 200 else d}")
    c, d = req("POST", "/rest/v1/rpc/get_member_stats", tok, {})
    ok(c == 200 and isinstance(d, list) and set(d[0].keys()) == {"user_id", "attended"}, "get_member_stats returns only user_id + count")
    # Phase 4.1 — S-3: own finished books cannot be deleted through the API (reading ones can)
    c, d = req("POST", "/rest/v1/rpc/save_user_book", tok, {"p_title": "API S3 reading", "p_author": "API", "p_genre": None, "p_status": "reading"})
    rid = d
    c, d = req("DELETE", f"/rest/v1/user_books?id=eq.{rid}", tok)
    ok(c == 200 and len(d) == 1, f"S-3: a book being read can be removed through the API → {c} {len(d) if isinstance(d, list) else d}")
    # short review on purpose: no reward is granted to the test account
    c, d = req("POST", "/rest/v1/rpc/save_user_book", tok, {"p_title": "API S3 finished", "p_author": "API", "p_genre": None, "p_status": "completed", "p_rating": 4, "p_review": "short"})
    cid = d
    c, d = req("DELETE", f"/rest/v1/user_books?id=eq.{cid}", tok)
    ok(c == 200 and d == [], f"S-3: a finished book is not deleted through the API → {c} {d}")
    ok(sql(f"select count(*)::int n from public.user_books where id = '{cid}'")[0]["n"] == 1, "S-3: …it is still there")
    c, d = req("PATCH", f"/rest/v1/user_books?id=eq.{cid}", tok, {"status": "reading"})
    ok(c in (401, 403), f"S-3: status cannot be changed directly (only via save_user_book) → {c}")
    # Phase 4.1 — P4-10: capacity
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", tok, {"capacity": 1})
    ok((c == 200 and d == []) or c in (401, 403), f"P4-10: a member cannot change capacity → {c} {d}")
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", None, {"capacity": 1})
    ok(c in (401, 403), f"P4-10: a guest cannot change capacity → {c}")
    # organizer of the event
    c, d = req("GET", f"/rest/v1/event_registrations?event_id=eq.{ev}", otok)
    ok(c == 200 and len(d) == 3, f"the event's organizer sees all its registrations incl. cancelled: {len(d)}")
    c, d = req("PATCH", f"/rest/v1/event_registrations?event_id=eq.{ev}", otok, {"status": "cancelled"})
    ok(c in (401, 403), f"…but cannot change them directly → {c}")
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", otok, {"capacity": 1})
    ok(c == 400 and "capacity_below_registered" in json.dumps(d), f"P4-10: organizer cannot set capacity below the 2 registered → {c}")
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", otok, {"capacity": 2})
    ok(c == 200 and d and d[0]["capacity"] == 2, f"P4-10: capacity equal to registrations is allowed → {c}")
    c, d = req("PATCH", f"/rest/v1/events?id=eq.{ev}", otok, {"capacity": 15})
    ok(c == 200 and d and d[0]["capacity"] == 15, f"P4-10: more is allowed → {c}")
    c, d = req("POST", "/rest/v1/rpc/get_event_counts", otok, {"p_events": [ev]})
    ok(c == 200 and d[0]["registered"] == 2, "P4-10: registrations untouched")
finally:
    sql("delete from public.events where title='API test 4'")
    sql("delete from public.user_books where book_id in (select id from public.books where author = 'API' and title like 'API S3 %'); delete from public.books where author = 'API' and title like 'API S3 %'")
    print("cleanup:", sql("select count(*)::int n from public.events where title='API test 4'"))
    print(f"{P} passed, {F} failed")
    sys.exit(1 if F else 0)
