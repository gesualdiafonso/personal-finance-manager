#!/usr/bin/env bash
# AUREON — validate database/sql against a LOCAL, throwaway PostgreSQL. Never points at Supabase.
# Usage: PGHOST=/tmp/pgtest PGPORT=55432 database/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${AUREON_TEST_DB:-aureon_test}"
P=(psql -U "${PGUSER:-postgres}" -v ON_ERROR_STOP=1 -q -X)
case "${PGHOST:-}" in *supabase*) echo "Refusing: PGHOST looks like Supabase. This runner is for a LOCAL database only." >&2; exit 2;; esac
"${P[@]}" -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"
"${P[@]}" -d "$DB" -f tests/supabase-emulation.sql
"${P[@]}" -d "$DB" -f sql/00_preflight_checks.sql > /dev/null
for f in 01 02 03 04 05 06 07; do
  "${P[@]}" -d "$DB" -f sql/${f}_*.sql > /dev/null
  echo "applied ${f}"
done
"${P[@]}" -d "$DB" -f tests/behaviour.sql
# Re-running 01–06 must stop with a clear message and change nothing; 07 is idempotent.
for f in 01 02 03 04 05 06; do
  if out=$("${P[@]}" -d "$DB" -f sql/${f}_*.sql 2>&1); then echo "FAIL rerun ${f}: should have stopped" >&2; exit 1; fi
  echo "$out" | grep -q "já foi aplicado" || { echo "FAIL rerun ${f}: $out" >&2; exit 1; }
  echo "PASS rerun ${f} stops with 'já foi aplicado'"
done
"${P[@]}" -d "$DB" -f sql/07_rls_enablement.sql > /dev/null && echo "PASS rerun 07 is idempotent"
# The uninstall script must refuse while financial data exists (behaviour.sql leaves some).
if out=$("${P[@]}" -d "$DB" -f sql/99_uninstall_empty_install.sql 2>&1); then echo "FAIL 99 ran with data present" >&2; exit 1; fi
echo "$out" | grep -q "Desinstalação recusada" && echo "PASS 99 refuses to uninstall while data exists"
# After installation, the preflight must flag the existing tables.
"${P[@]}" -d "$DB" -f sql/00_preflight_checks.sql | grep -q "ERRO" && echo "PASS 00 flags an existing installation"
"${P[@]}" -d "$DB" -f sql/08_verification.sql
# Step 14 — 09_profile_access.sql: applies, is idempotent, verifies itself, behaves, and 08 stays green.
out=$("${P[@]}" -d "$DB" -A -t -f sql/09_profile_access.sql)
echo "$out" | grep -q "|f$" && { echo "FAIL 09 self-verification: $out" >&2; exit 1; }
echo "PASS 09 applied (self-verification all true)"
out=$("${P[@]}" -d "$DB" -A -t -f sql/09_profile_access.sql)
echo "$out" | grep -q "|f$" && { echo "FAIL 09 rerun: $out" >&2; exit 1; }
echo "PASS rerun 09 is idempotent"
"${P[@]}" -d "$DB" -f tests/behaviour-09.sql
if out=$("${P[@]}" -d "$DB" -f sql/07_rls_enablement.sql 2>&1); then echo "FAIL 07 after 09 should stop (policies exist)" >&2; exit 1; fi
echo "$out" | grep -q "políticas" && echo "PASS 07 after 09 stops and changes nothing"
summary=$("${P[@]}" -d "$DB" -A -t -f sql/08_verification.sql | head -1)
case "$summary" in *"|0 com erro|OK") echo "PASS 08 after 09: $summary";; *) echo "FAIL 08 after 09: $summary" >&2; exit 1;; esac
