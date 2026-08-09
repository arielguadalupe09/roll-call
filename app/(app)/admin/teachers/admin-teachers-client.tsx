"use client";

import { useState } from "react";
import type { Teacher } from "@/lib/types";
import IconButton from "@/app/_components/icon-button";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";

export default function AdminTeachersClient({
  initialTeachers,
  currentUserId,
}: {
  initialTeachers: Teacher[];
  currentUserId: string;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [teachers, setTeachers] = useState(initialTeachers);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [settingAdminId, setSettingAdminId] = useState<string | null>(null);

  async function handleSetAdmin(teacher: Teacher, nextIsAdmin: boolean) {
    const confirmed = await confirm(
      nextIsAdmin
        ? `Make "${teacher.email}" an admin? They'll be able to create, edit, and delete teacher accounts.`
        : `Remove admin access from "${teacher.email}"? They'll become a regular teacher.`,
      { confirmLabel: nextIsAdmin ? "Make admin" : "Remove admin", danger: !nextIsAdmin },
    );
    if (!confirmed) return;

    setSettingAdminId(teacher.id);
    const res = await fetch("/api/admin/set-teacher-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id, isAdmin: nextIsAdmin }),
    });
    const data = await res.json();
    setSettingAdminId(null);

    if (!res.ok) {
      showToast(data.error ?? "Could not update the account's role.");
      return;
    }

    setTeachers((prev) =>
      prev.map((t) => (t.id === teacher.id ? (data.teacher as Teacher) : t)),
    );
    showToast(
      nextIsAdmin ? `"${teacher.email}" is now an admin.` : `"${teacher.email}" is now a teacher.`,
    );
  }

  async function handleResetPassword(teacher: Teacher) {
    const newPassword = window.prompt(
      `New password for "${teacher.email}" (min 6 characters):`,
    );
    if (!newPassword) return;

    setResettingId(teacher.id);
    const res = await fetch("/api/admin/reset-teacher-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id, newPassword }),
    });
    const data = await res.json();
    setResettingId(null);

    if (!res.ok) {
      showToast(data.error ?? "Could not reset the password.");
      return;
    }

    showToast(`Password reset for "${teacher.email}".`);
  }

  function startEdit(teacher: Teacher) {
    setEditingId(teacher.id);
    setEditName(teacher.full_name ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleSaveEdit(teacherId: string) {
    setSavingEdit(true);
    const res = await fetch("/api/admin/update-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, fullName: editName }),
    });
    const data = await res.json();
    setSavingEdit(false);

    if (!res.ok) {
      showToast(data.error ?? "Could not update the account.");
      return;
    }

    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? (data.teacher as Teacher) : t)));
    cancelEdit();
  }

  async function handleDelete(teacher: Teacher) {
    const confirmed = await confirm(
      `Delete the account for "${teacher.email}"? This can't be undone.`,
      { danger: true, confirmLabel: "Delete" },
    );
    if (!confirmed) return;

    setDeletingId(teacher.id);
    const res = await fetch("/api/admin/delete-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id }),
    });
    const data = await res.json();
    setDeletingId(null);

    if (!res.ok) {
      showToast(data.error ?? "Could not delete the account.");
      return;
    }

    setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/create-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create the account.");
      return;
    }

    setTeachers((prev) => [...prev, data.teacher as Teacher]);
    setEmail("");
    setPassword("");
    setFullName("");
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Email</span>
          <input
            type="email"
            placeholder="e.g. juan.delacruz@pampangastateu.edu.ph"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Full name (optional)</span>
          <input
            type="text"
            placeholder="e.g. Juan Dela Cruz"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create teacher account"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <div className="mt-6 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Role</th>
              <th className="py-2 px-3">Joined</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-rule/50 bg-white">
                <td className="py-2 px-3 text-ink">{t.email}</td>
                <td className="py-2 px-3 text-ink">
                  {editingId === t.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      autoFocus
                      className="w-full rounded-sm border border-brass bg-white px-2 py-1 text-ink outline-none"
                    />
                  ) : (
                    t.full_name || "—"
                  )}
                </td>
                <td className="py-2 px-3">
                  {t.id === currentUserId ? (
                    <span className="rounded-sm bg-brass/20 px-2 py-0.5 font-mono text-xs font-semibold text-brass">
                      Admin (you)
                    </span>
                  ) : (
                    <select
                      value={t.is_admin ? "admin" : "teacher"}
                      onChange={(e) => handleSetAdmin(t, e.target.value === "admin")}
                      disabled={settingAdminId === t.id}
                      className="rounded-sm border border-rule bg-white px-2 py-1 font-mono text-xs text-ink outline-none focus:border-brass disabled:opacity-60"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-ink/60">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 px-3 text-right">
                  {editingId === t.id ? (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleSaveEdit(t.id)}
                        disabled={savingEdit}
                        className="text-sm text-teal underline underline-offset-2 disabled:opacity-60"
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-sm text-ink/60 underline underline-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <IconButton
                        icon="reset"
                        color="brass"
                        label="Reset password"
                        onClick={() => handleResetPassword(t)}
                        disabled={resettingId === t.id}
                      />
                      <IconButton
                        icon="edit"
                        color="teal"
                        label="Edit"
                        onClick={() => startEdit(t)}
                      />
                      {!t.is_admin && (
                        <IconButton
                          icon="delete"
                          color="danger"
                          label="Delete"
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                        />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 px-3 text-ink/60">
                  No teachers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
