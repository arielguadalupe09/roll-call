import { redirect } from "next/navigation";

// /student now covers both jobs (checking in and viewing grades) in one
// visit -- entering a code there also marks the student present if their
// teacher has a session open. This route stays only so old bookmarks, home
// screen installs, and printed instructions pointing at /checkin still land
// somewhere real instead of a 404.
export default function PublicCheckinPage() {
  redirect("/student");
}
