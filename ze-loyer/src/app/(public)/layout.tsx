import Link from "next/link";
import { Logo } from "@/components/shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-md items-center px-4">
        <Link href="/">
          <Logo className="text-lg text-brand-800" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">{children}</main>
    </div>
  );
}
