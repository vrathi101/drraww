import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotesDashboard } from "@/components/notes/dashboard";
import { listNotes } from "@/lib/notes";

export default async function DashboardPage() {
  const notes = await listNotes();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      <NotesDashboard notes={notes} />
    </div>
  );
}
