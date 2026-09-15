-- students rows are per-class enrollments: the same real student taking
-- several subjects has one row (and one QR code) per class. The global
-- unique index from 0017 meant a phone that already bound to a student's
-- row in one class silently failed to bind on their own row in a second
-- class -- the device-lock re-check in lib/student-device-lock.ts (already
-- updated to compare by name, allowing the same phone across a student's
-- own classes) would keep passing, but the bind itself never stuck, so the
-- "locked device" state was lost for every class after the first.
--
-- Scoping the unique index to (class_id, device_id) keeps the guarantee
-- that actually matters at the database level -- a device can never be
-- bound to two different students *within the same class* -- while
-- allowing the same phone to legitimately bind across a student's
-- different class rows. Cross-class impersonation prevention is handled at
-- the application layer (name comparison in checkDeviceLock), since there's
-- no shared person identity across class rows to enforce it in SQL.
-- Run this once in the SQL Editor after 0017.

drop index if exists students_device_id_unique;

create unique index if not exists students_device_id_per_class_unique
  on students (class_id, device_id)
  where device_id is not null;
