-- Allow a "periodic" violation type: a timed webcam snapshot taken every
-- ~20 minutes during an exam attempt (independent of any tab/focus/paste
-- violation), so a teacher can spot-check behavior (e.g. a phone in frame)
-- that the existing event-based detection can't catch. Not counted as a
-- "flagged" violation on the teacher results page.
alter table exam_violations drop constraint if exists exam_violations_type_check;
alter table exam_violations add constraint exam_violations_type_check
  check (type in ('tab_switch', 'window_blur', 'fullscreen_exit', 'copy_paste', 'periodic'));
