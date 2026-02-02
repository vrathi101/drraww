import { NoteEditor } from "@/components/notes/note-editor";
import { getNote } from "@/lib/notes";

type Props = {
  params: { id: string };
};

export default async function NotePage({ params }: Props) {
  const note = await getNote(params.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-6 py-8">
      <NoteEditor
        noteId={note.id}
        initialTitle={note.title}
        initialSnapshot={note.doc}
        initialUpdatedAt={note.updated_at}
      />
    </div>
  );
}
