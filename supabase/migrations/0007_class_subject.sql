-- Adds a Subject field to classes, distinct from the class/section name.
-- Used on the Student Individual Record Card's "Subject" cell, separate
-- from "Year & Section" which continues to use the class name.
-- Run this once in the SQL Editor after 0001-0006.

alter table classes add column if not exists subject text;
