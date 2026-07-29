# Link project, set Verify.ET secrets, redeploy game-action.
# Prerequisite: npx supabase login  (or set SUPABASE_ACCESS_TOKEN)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Linking project gdyyngrhazvnszqawdog..."
npx supabase link --project-ref gdyyngrhazvnszqawdog

Write-Host "Setting Verify.ET secrets..."
npx supabase secrets set `
  VERIFY_ET_BASE_URL=https://verify.et `
  VERIFY_ET_API_KEY=VERIFY_BANK_ET_M7UwtZyLqP5Q3SYBw0DLr85Hmgz5td_aKkF76Nb-5pnHOauVoJT6jPjzC_ltyVMY

# Optional: restrict deposits to your settlement account
# npx supabase secrets set VERIFY_ET_SETTLEMENT_ACCOUNT=0939080897

Write-Host "Deploying game-action..."
npx supabase functions deploy game-action

Write-Host "Done. Current secrets:"
npx supabase secrets list
