import type { AppErrorCode } from "@/lib/errors/app-error";

/**
 * Spanish (es-AR) interface strings — Step 01 sets Spanish as the initial language.
 * The Design System was written in Portuguese; these are direct translations of its
 * approved labels and still need product approval (docs/decisions/ADR-005-idioma.md).
 * All interface text lives here so the wording can be revised in one place.
 */
export const es = {
  app: {
    name: "PFM",
    description: "Gestión de finanzas personales",
    skipToContent: "Ir al contenido",
  },
  nav: {
    primaryLabel: "Navegación principal",
    newTransaction: "Nueva transacción",
    groups: {
      obligations: "Obligaciones",
      assets: "Patrimonio",
      plan: "Plan",
    },
    areas: {
      dashboard: "Panel",
      transactions: "Transacciones",
      bills: "Cuentas domésticas",
      cards: "Tarjetas",
      recurrences: "Recurrencias",
      accounts: "Cuentas",
      budget: "Presupuesto",
      reports: "Informes",
      settings: "Configuración",
    },
    mobile: {
      home: "Inicio",
      transactions: "Transacciones",
      add: "Registrar",
      obligations: "Obligaciones",
      more: "Más",
      close: "Cerrar",
    },
  },
  dataStatus: {
    noPublication: "Sin datos publicados",
    publishedAt: (when: string) => `Datos del ${when}`,
    nothingToExport: "Nada por exportar",
    pendingExport: (n: number) => (n === 1 ? "1 cambio por exportar" : `${n} cambios por exportar`),
    storageReady: "Almacenamiento local listo",
    storageUnavailable: "Almacenamiento local no disponible",
  },
  dashboard: {
    availableBalance: "Saldo disponible",
    emptyHint: "Agrega la primera cuenta para empezar.",
    addAccount: "Agregar cuenta",
  },
  placeholder: {
    laterStep: "Esta área se implementa en un paso posterior.",
  },
  settings: {
    appearance: "Apariencia",
    appearanceHint: "Se guarda solo en este dispositivo.",
    theme: { system: "Sistema", paper: "Claro", dark: "Oscuro" },
    localData: "Datos locales",
    localStore: "Almacenamiento local",
    storeReady: (v: number) => `Listo · versión ${v}`,
    localDataHint: "Los datos se guardan en este dispositivo. No hay sincronización automática.",
    publication: "Publicación importada",
    revision: (n: number) => `Revisión ${n}`,
    pendingChanges: "Cambios por exportar",
    integrity: "Integridad",
    integrityOk: "Correcta",
    integrityProblems: "Con problemas",
  },
  offline: {
    title: "Sin conexión",
    body: "No hay conexión y esta página todavía no está disponible sin conexión. Las páginas que ya abriste siguen funcionando.",
    retry: "Reintentar",
  },
  errors: {
    title: "Algo salió mal",
    retry: "Reintentar",
    notFoundTitle: "Página no encontrada",
    backHome: "Volver al panel",
    codes: {
      VALIDATION_FAILED: "Los datos no pasaron la validación.",
      INCOMPATIBLE_SCHEMA_VERSION: "Actualiza la aplicación para leer estos datos.",
      DATA_REVISION_REGRESSION: "Estos datos son más antiguos que los que ya tienes.",
      INTEGRITY_FAILED: "Los datos no pasaron la verificación de integridad.",
      STORAGE_UNAVAILABLE: "El almacenamiento local no está disponible en este navegador.",
      STORAGE_FAILURE: "No se pudo guardar en el almacenamiento local.",
      CRYPTO_FAILED: "No se pudieron descifrar los datos.",
      CURRENCY_MISMATCH: "No se pueden combinar importes en monedas distintas.",
      NOT_FOUND: "El registro no existe.",
      DUPLICATE_ID: "Ya existe un registro con ese identificador.",
      POSSIBLE_DUPLICATE: "Parece un registro duplicado.",
      REFERENCE_CONSTRAINT: "El registro está en uso y no se puede eliminar; se puede archivar.",
      CONFLICT: "El registro cambió desde la última lectura.",
      IMPORT_REJECTED: "La importación fue rechazada; no se cambió nada.",
      MIGRATION_BLOCKED: "La migración necesita una decisión manual; no se cambió nada.",
      PROTECTED_OPERATION: "Esta operación necesita una confirmación explícita.",
      UNKNOWN: "Ocurrió un error inesperado.",
    } satisfies Record<AppErrorCode, string>,
  },
} as const;

export type Messages = typeof es;
export const messages: Messages = es;
