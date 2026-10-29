import { requireStaff } from "@/server/context";
import { AccountPage } from "@/components/account-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AccountPage actor={await requireStaff(slug)} />;
}
