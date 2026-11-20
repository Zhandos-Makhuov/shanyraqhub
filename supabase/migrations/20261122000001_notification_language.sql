-- Shanyraq Hub — notifications in the member's language (owner decision 2026-11-20: Kazakh is the main language).
-- The server keeps writing its texts in Russian (one place to read them); private.notify translates title and
-- body for the recipient's profiles.preferred_language before storing them, so the site, Web Push and the
-- Telegram bot all show the same, already translated text. Additive: no data is changed.

-- New members start in Kazakh (they can switch the language on the site; the site saves it to the profile).
alter table public.profiles alter column preferred_language set default 'kz';

-- Fixed texts and templates. "pattern" is an anchored regular expression over the Russian text;
-- kz/en are replacements (\1, \2 … refer to the pattern's groups).
create table private.notification_i18n (
  id      serial primary key,
  pattern text not null unique,
  kz      text not null,
  en      text not null
);

insert into private.notification_i18n (pattern, kz, en) values
  ('Повышение клубного ранга!', 'Деңгейіңіз көтерілді!', 'Tier up!'),
  ('Новое достижение!', 'Жаңа жетістік!', 'New achievement!'),
  ('Достижение отозвано', 'Жетістік қайтарып алынды', 'Achievement revoked'),
  ('Успешная регистрация на мероприятие', 'Іс-шараға сәтті жазылдыңыз', 'You are signed up'),
  ('Визит подтверждён', 'Қатысу расталды', 'Visit confirmed'),
  ('Новый ответ в вашей теме', 'Тақырыбыңызға жаңа жауап', 'New reply in your topic'),
  ('Новый отзыв в вашем профиле', 'Профиліңізде жаңа пікір', 'New review on your profile'),
  ('Заявка в направление одобрена', 'Бағытқа өтінішіңіз мақұлданды', 'Your direction application was approved'),
  ('Заявка в направление отклонена', 'Бағытқа өтінішіңіз қабылданбады', 'Your direction application was declined'),
  ('Напоминание: встреча завтра', 'Еске салу: кездесу ертең', 'Reminder: meetup tomorrow'),
  ('Напоминание: встреча через 2 часа', 'Еске салу: кездесуге 2 сағат қалды', 'Reminder: meetup in 2 hours'),
  ('Добро пожаловать!', 'Қош келдіңіз!', 'Welcome!'),
  ('Можно подать снова через 7 дней\.', '7 күннен кейін қайта өтініш беруге болады.', 'You can apply again in 7 days.'),
  ('Администратор отозвал «(.*)»\. Причина: (.*)', 'Әкімші «\1» жетістігін қайтарып алды. Себебі: \2', 'An admin revoked “\1”. Reason: \2'),
  ('Вы записаны на «(.*)»\.', '«\1» кездесуіне жазылдыңыз.', 'You are signed up for “\1”.'),
  ('\+(\d+) XP и \+(\d+) коинов за «(.*)»', '«\3» үшін +\1 XP және +\2 коин', '+\1 XP and +\2 coins for “\3”'),
  ('(.*) оставил\(а\) отзыв: «(.*)»', '\1 сізге пікір қалдырды: «\2»', '\1 left you a review: “\2”'),
  ('«(.*)» — (.*) \(Алматы\)', '«\1» — \2 (Алматы уақыты)', '“\1” — \2 (Almaty time)');

create function private.translate_notification(p_text text, p_lang public.app_language)
returns text language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if p_text is null or p_lang = 'ru' then return p_text; end if;
  for r in select pattern, kz, en from private.notification_i18n order by id loop
    if p_text ~ ('^(?:' || r.pattern || ')$') then
      return regexp_replace(p_text, '^(?:' || r.pattern || ')$', case p_lang when 'kz' then r.kz else r.en end);
    end if;
  end loop;
  return p_text; -- free text (forum reply, admin's own words) stays as written
end $$;

create or replace function private.notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text,
  p_link_tab text default null, p_meta jsonb default '{}', p_dedupe_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_lang public.app_language;
  v_ach public.achievements%rowtype;
  v_tier public.tiers%rowtype;
begin
  select preferred_language into v_lang from public.profiles where id = p_user;
  v_lang := coalesce(v_lang, 'kz');
  if v_lang <> 'ru' then
    -- Names that live in catalogs: use the catalog's own translation.
    if p_meta ? 'achievement_id' then
      select * into v_ach from public.achievements where id = p_meta ->> 'achievement_id';
      if found then
        p_body := replace(p_body, v_ach.title_ru, case v_lang when 'kz' then v_ach.title_kz else v_ach.title_en end);
      end if;
    end if;
    if p_type = 'level_up' and p_meta ? 'tier' then
      select * into v_tier from public.tiers where tier = p_meta ->> 'tier';
      if found then
        p_body := case v_lang when 'kz' then 'Құттықтаймыз! Жаңа деңгейіңіз: ' || v_tier.name_kz
                              else 'Congratulations! Your new tier: ' || v_tier.name_en end;
      end if;
    end if;
    p_title := private.translate_notification(p_title, v_lang);
    p_body := private.translate_notification(p_body, v_lang);
  end if;
  insert into public.notifications (user_id, type, title, body, link_tab, meta, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_link_tab, coalesce(p_meta, '{}'), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

revoke all on function private.translate_notification(text, public.app_language) from public, anon, authenticated;
