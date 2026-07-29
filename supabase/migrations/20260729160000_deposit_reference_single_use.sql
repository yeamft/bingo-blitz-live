-- Enforce single-use payment references for Verify.ET deposits.
--
-- Previously request_deposit stored the reference only inside the free-text
-- note, so wallet_requests_provider_reference_uidx never applied and the same
-- bank receipt could be credited repeatedly.

-- Backfill provider / provider_reference from legacy "provider=x | reference=y" notes
-- so historic receipts cannot be replayed once the new index is in place.
update public.wallet_requests
set
  provider = coalesce(
    provider,
    nullif(substring(note from 'provider=([^|]+)'), '')
  ),
  provider_reference = coalesce(
    provider_reference,
    nullif(substring(note from 'reference=([^|]+)'), '')
  )
where kind = 'deposit'
  and note is not null
  and (provider is null or provider_reference is null);

-- Store the canonical form the edge function looks up with.
update public.wallet_requests
set
  provider = lower(btrim(provider)),
  provider_reference = upper(btrim(provider_reference))
where kind = 'deposit'
  and (provider is not null or provider_reference is not null);

-- Drop duplicates that predate the constraint, keeping the earliest credited row.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(btrim(provider)), upper(btrim(provider_reference))
      order by
        case when status = 'approved' then 0 else 1 end,
        created_at
    ) as rn
  from public.wallet_requests
  where kind = 'deposit'
    and provider is not null
    and provider_reference is not null
)
update public.wallet_requests wr
set provider_reference = wr.provider_reference || '#dup-' || wr.id
from ranked
where wr.id = ranked.id
  and ranked.rn > 1;

-- Case-insensitive, status-independent: a reference may be redeemed exactly once.
create unique index if not exists wallet_requests_provider_reference_norm_uidx
  on public.wallet_requests (lower(btrim(provider)), upper(btrim(provider_reference)))
  where kind = 'deposit'
    and provider is not null
    and provider_reference is not null;

comment on index public.wallet_requests_provider_reference_norm_uidx is
  'Single-use guarantee for Verify.ET payment references. request_deposit claims the reference before calling the provider.';
