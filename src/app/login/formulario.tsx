"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Boton, Campo, ErrorAviso, Input } from "@/components/ui";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(login, undefined);

  return (
    <form action={accion} className="space-y-4">
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

      <Campo etiqueta="Correo">
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="vos@koncepto.com"
        />
      </Campo>

      <Campo etiqueta="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Campo>

      <Boton disabled={pendiente} className="w-full">
        {pendiente ? "Entrando…" : "Entrar"}
      </Boton>
    </form>
  );
}
