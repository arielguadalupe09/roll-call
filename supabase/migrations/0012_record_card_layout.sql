-- Lets teachers reorder Record Card sections and rename their printed
-- titles, on top of the show/hide toggles added in 0011.
-- Shape: { "order": string[], "titles": { [sectionKey]: string } }
-- Run this once in the SQL Editor after 0001-0011.

alter table grading_configs
  add column if not exists record_card_layout jsonb not null default '{}'::jsonb;
