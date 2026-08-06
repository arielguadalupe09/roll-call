-- Lets teachers archive classes from past semesters so they stop cluttering
-- the dashboard and sidebar, without deleting their data.
-- Run this once in the SQL Editor after 0001-0009.

alter table classes add column if not exists archived boolean not null default false;
