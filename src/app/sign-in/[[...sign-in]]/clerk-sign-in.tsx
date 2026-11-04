import { SignIn } from "@clerk/nextjs";

export function ClerkSignIn() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
