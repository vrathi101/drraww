export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      notes: {
        Row: {
          created_at: string;
          doc: Json;
          id: string;
          is_deleted: boolean;
          is_pinned: boolean;
          owner_id: string;
          folder_id: string | null;
          pinned_at: string | null;
          thumbnail_path: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          doc?: Json;
          id?: string;
          is_deleted?: boolean;
          is_pinned?: boolean;
          owner_id: string;
          folder_id?: string | null;
          pinned_at?: string | null;
          thumbnail_path?: string | null;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          doc?: Json;
          id?: string;
          is_deleted?: boolean;
          is_pinned?: boolean;
          owner_id?: string;
          folder_id?: string | null;
          pinned_at?: string | null;
          thumbnail_path?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey";
            columns: ["folder_id"];
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_owner_id_fkey";
            columns: ["owner_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      note_revisions: {
        Row: {
          created_at: string;
          doc: Json;
          id: string;
          note_id: string;
          owner_id: string;
          reason: string | null;
        };
        Insert: {
          created_at?: string;
          doc: Json;
          id?: string;
          note_id: string;
          owner_id: string;
          reason?: string | null;
        };
        Update: {
          created_at?: string;
          doc?: Json;
          id?: string;
          note_id?: string;
          owner_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "note_revisions_note_id_fkey";
            columns: ["note_id"];
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_revisions_owner_id_fkey";
            columns: ["owner_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_owner_id_fkey";
            columns: ["owner_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
