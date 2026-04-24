create or replace view public.session_token_summary as
select
  tu.session_id,
  tu.user_id,
  p.display_name,
  sum(tu.tokens_in)  as total_tokens_in,
  sum(tu.tokens_out) as total_tokens_out,
  sum(tu.cost_usd)   as total_cost_usd
from public.token_usage tu
join public.profiles p on p.id = tu.user_id
group by tu.session_id, tu.user_id, p.display_name;

grant select on public.session_token_summary to authenticated;
