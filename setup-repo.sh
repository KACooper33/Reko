#!/usr/bin/env bash
# One-time repo setup: labels and milestones for Reko.
# Requires the GitHub CLI, authenticated: https://cli.github.com
#
#   chmod +x setup-repo.sh && ./setup-repo.sh
#
# Safe to re-run — existing labels/milestones are skipped, not overwritten.

set -euo pipefail

echo "Creating labels..."

# --- Who does the work ---
gh label create "agent"  --color "5319E7" --description "Claude executes this in a session" --force
gh label create "human"  --color "0E8A16" --description "You do this off-screen and report back" --force

# --- Track ---
gh label create "track-a-data"       --color "1D76DB" --description "RxNorm, DailyMed, content pipeline" --force
gh label create "track-b-app"        --color "FBCA04" --description "Expo app, OCR, parser, UI" --force
gh label create "track-c-validation" --color "D93F0B" --description "Paper test, cabinet survey, golden set" --force

# --- Type ---
gh label create "decision"  --color "BFD4F2" --description "Needs a call before work can proceed" --force
gh label create "blocked"   --color "B60205" --description "Waiting on something external" --force
gh label create "guardrail" --color "000000" --description "Touches the §5 boundary — review carefully" --force

echo "Creating milestones..."

create_milestone () {
  local title="$1"
  local desc="$2"
  if gh api "repos/{owner}/{repo}/milestones" --jq '.[].title' | grep -Fxq "$title"; then
    echo "  = $title (exists, skipping)"
  else
    gh api "repos/{owner}/{repo}/milestones" \
      -f title="$title" -f description="$desc" \
      --silent && echo "  + $title"
  fi
}

create_milestone "v1"   "OTC only. Top 100 actives. Android only. Scan, confirm, explain, brand bridge."
create_milestone "v1.5" "iOS. Requires Apple Developer Program enrollment."
create_milestone "v2"   "OTC with bundling — compare multiple products for shared ingredients."
create_milestone "v3"   "Expanded OTC ingredient coverage beyond the Top 100."
create_milestone "v4"   "Prescription label support. Different label grammar — see handoff."

echo
echo "Done. Verify with:  gh label list  &&  gh api repos/{owner}/{repo}/milestones --jq '.[].title'"
