import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotesDashboard } from "@/components/notes/dashboard";
import { listFolders, listNotes } from "@/lib/notes";
import { listTags } from "@/lib/tags";

export default async function DashboardPage() {
  const [notes, folders, tags] = await Promise.all([
    listNotes(),
    listFolders(),
    listTags(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      <NotesDashboard notes={notes} folders={folders} tags={tags} />
    </div>
  );
}
