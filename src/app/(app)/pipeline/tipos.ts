// Lo que la página le pasa a los componentes cliente. Nada de objetos de Prisma acá:
// los Date no serializan y los montos ya vienen en centavos.

export type ClienteOpcion = { id: string; nombre: string };

export type OportunidadVista = {
  id: string;
  nombre: string;
  monto: number;
  sena: number | null;
  confirmado: boolean;
  notas: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  /** Si ya se convirtió. `clienteId` es a dónde linkear el trabajo. */
  trabajo: { id: string; clienteId: string } | null;
};
