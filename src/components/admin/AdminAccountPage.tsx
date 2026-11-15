import {
  AdminAuthenticatorCard,
  AdminEmailCard,
  AdminNameForm,
  AdminPasswordForm,
} from "@/components/admin/AdminAccountForms";

/** The four account sections, in one readable column. */
export function AdminAccountForms({ name, email, authenticators }: { name: string | null; email: string | null; authenticators: number }) {
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <AdminNameForm name={name} />
      <AdminEmailCard email={email} />
      <AdminPasswordForm />
      <AdminAuthenticatorCard count={authenticators} />
    </div>
  );
}
