-- Belt-and-suspenders for the device lock added in 0016: the API already
-- checks "is this device already bound to a different student" before
-- writing, but two near-simultaneous first-time scans from the same phone
-- could both pass that check before either commits. This constraint makes
-- the database itself reject the second write instead of silently letting
-- one device end up bound to two students.
-- Run this once in the SQL Editor after 0016.

-- The 0016 device lock's app-level check didn't cover the reverse
-- direction (one device binding to more than one student) until
-- immediately before this migration was written, so real testing data can
-- already have a device_id shared across multiple students -- the unique
-- index below can't be created while that duplication exists, and there's
-- no safe way to guess which student legitimately owns a shared device
-- from the data alone, so every affected student is reset and re-binds on
-- their next check-in.
update students
set device_id = null
where device_id in (
  select device_id
  from students
  where device_id is not null
  group by device_id
  having count(*) > 1
);

create unique index if not exists students_device_id_unique
  on students (device_id)
  where device_id is not null;
