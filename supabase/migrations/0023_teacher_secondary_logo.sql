-- A second logo slot alongside the existing card_logo_path -- printed
-- official documents (e.g. the exam quiz-paper letterhead) commonly need
-- two logos side by side (school seal + a national/government logo),
-- while the Record Card only ever used one.
alter table teachers add column if not exists card_logo_path_secondary text;
