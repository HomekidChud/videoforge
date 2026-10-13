#!/usr/bin/env bash
# VideoForge pre-commit secret scanner.
#
# Blocks commits that contain obvious credential patterns in the staged diff.
# This is the local fast-path gate; CI should additionally run gitleaks
# (https://github.com/gitleaks/gitleaks) over the full repo history.
#
# Install:
#   cp script/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# Design notes:
#   - Scans only the STAGED DIFF (fast). Full-history scanning belongs in CI.
#   - Each pattern is joined into a single alternation and passed to `grep -E`
#     as ONE argument (the previous version passed multiple patterns, which
#     `grep` treated as file names — silently failing open).
#   - Case-insensitivity is handled via `grep -i` (BRE/ERE has no `(?i)`).
#   - Always exits non-zero on a real detection, and never prints the secret
#     value itself — only the line number and the rule that matched.
#   - If `grep` itself fails (not "no match"), we fail CLOSED (exit 1).

set -euo pipefail

# `package-lock.json` is a machine-generated dependency tree with high-entropy
# integrity hashes that produce false positives; it is not hand-edited. We
# don't exclude any hand-authored files — a credential in docs/ is as bad as
# one in server/.
# Fail closed if `git diff` itself fails (don't swallow the error).
if ! DIFF=$(git diff --cached --unified=0 --no-color -- ':!package-lock.json' 2>&1); then
  echo "❌ pre-commit: git diff failed. Failing closed."
  echo "$DIFF"
  exit 1
fi
[ -z "$DIFF" ] && exit 0

# Single alternation, POSIX ERE, no lookaheads or inline flags.
PATTERN='(sk-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|ghp_[0-9a-zA-Z]{36}|gho_[0-9a-zA-Z]{36}|github_pat_[0-9A-Za-z_]{22,}|AIza[0-9A-Za-z_\-]{35}|glpat-[0-9a-zA-Z_\-]{20,}|xox[baprs]-[0-9a-zA-Z\-]{10,}|-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----|eyJhbGciOiJIUzI1NiIs|Bearer [0-9A-Za-z+/=_\-]{32,})'

# -E  extended regex
# -i  case-insensitive (replaces unsupported (?i))
# -n  line numbers
# -H  always show filename (stdin here, so a label)
set +e
HITS=$(printf '%s\n' "$DIFF" | grep -EinH --label=staged.diff "$PATTERN" 2>/dev/null)
GREP_RC=$?
set -e

# grep exit codes: 0 = match, 1 = no match, 2+ = error.
if [ "$GREP_RC" -ge 2 ]; then
  echo "❌ pre-commit: secret scanner itself failed (grep exit $GREP_RC). Failing closed."
  exit 1
fi

if [ "$GREP_RC" -eq 0 ] && [ -n "$HITS" ]; then
  echo ""
  echo "❌ Commit blocked: possible secret detected in staged diff."
  echo ""
  # Show line numbers and the matched prefix ONLY (never the full secret).
  printf '%s\n' "$HITS" | awk -F: '{print "  staged.diff:" $2 ": matched secret pattern on that line"}'
  echo ""
  echo "If this is a false positive, bypass with:  git commit --no-verify"
  echo "Then file an issue so the pattern can be tightened."
  exit 1
fi

exit 0
