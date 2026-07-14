import { Card } from "@/components/ui";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar — Koncepto" };

export default function LoginPage() {
  return (
    <main className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Koncepto</h1>
          <p className="text-sm text-tenue mt-1">Control de caja</p>
        </div>
        <Card>
          <div className="p-6">
            <FormularioLogin />
          </div>
        </Card>
      </div>
    </main>
  );
}
