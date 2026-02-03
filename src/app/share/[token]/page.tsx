import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

const ShareClient = dynamic(() => import("./share-client"), { ssr: false });

export default async function SharedNotePage({ params }: { params: { token: string } }) {
  if (!params.token) {
    notFound();
  }
  return <ShareClient token={params.token} />;
}
