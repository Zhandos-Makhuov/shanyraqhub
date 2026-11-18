#!/usr/bin/env bash
# Runs the proposed migrations + seed + security tests against a THROWAWAY local
# PostgreSQL (>= 15). Never point this at a Supabase project: it drops/creates a database.
#
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres ./supabase/tests/run-local.sh
set -euo pipefail
DB="${TEST_DB:-shanyraq_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
P=(psql -v ON_ERROR_STOP=1 -q)
"${P[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${P[@]}" -d "$DB" -f "$HERE/supabase_stub.sql"
for f in "$HERE"/../migrations/*.sql; do echo "applying $(basename "$f")"; "${P[@]}" -d "$DB" -f "$f"; done
"${P[@]}" -d "$DB" -f "$HERE/../seed.sql"
"${P[@]}" -d "$DB" -f "$HERE/security_tests.sql" 2>&1 | grep -E "PASS|FAIL|ERROR|ALL_TESTS" | sed 's/^psql:[^ ]* //;s/NOTICE:  //'
