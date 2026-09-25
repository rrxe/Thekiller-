-- قائمة أكثر اللاعبين كسباً لـ USDT (رصيد + سحوبات معلّقة/تمت).
-- قارن عمود usdt_earned مع qualified_refs * 0.05 (مكافأة الإحالة):
-- الفارق الكبير = جاي من تحويل العملات، وهذا اللي يستاهل تدقيق.
select
  p.telegram_id,
  p.username,
  p.coin,
  p.usdt_balance,
  p.is_duplicate_device,
  coalesce(w.total, 0) as withdrawn,
  p.usdt_balance + coalesce(w.total, 0) as usdt_earned,
  (select count(*) from players r
     where r.referred_by = p.telegram_id and r.referral_reward_claimed = true) as qualified_refs
from players p
left join (
  select telegram_id, sum(amount) as total
  from withdrawal_history
  where status in ('pending', 'completed')
  group by telegram_id
) w on w.telegram_id = p.telegram_id
order by usdt_earned desc
limit 30;
