import { describe, expect, it } from "vitest";
import { cargarConfiguracion } from "../../src/config/env.js";
import { KeyringCifradoCanal } from "../../src/seguridad/cifrado.js";

/**
 * Regresión permanente S-02/S-03 (docs/auditoria-2/seguridad.md): ningún
 * secreto crítico (JWT_SECRET, CANAL_CIFRADO_CLAVES) puede caer en un
 * valor por defecto hardcodeado en el repo cuando el entorno declarado no
 * es explícitamente desarrollo/pruebas — el arranque debe abortar
 * (fail-closed), nunca degradar en silencio.
 */
describe("cargarConfiguracion — S-02/S-03: secretos obligatorios fuera de desarrollo/pruebas", () => {
  it("lanza si NODE_ENV='production' y falta JWT_SECRET", () => {
    expect(() =>
      cargarConfiguracion({ NODE_ENV: "production", CANAL_CIFRADO_CLAVES: "v1:cualquierClaveDe32BytesEnB64==" }),
    ).toThrow(/JWT_SECRET es obligatorio/);
  });

  it("lanza si NODE_ENV='production' y falta CANAL_CIFRADO_CLAVES", () => {
    expect(() =>
      cargarConfiguracion({
        NODE_ENV: "production",
        JWT_SECRET: "secreto-de-produccion-real-con-al-menos-32-caracteres",
      }),
    ).toThrow(/CANAL_CIFRADO_CLAVES es obligatorio/);
  });

  it("lanza si NODE_ENV es un valor distinto a development/test (typo, acentos, mayúsculas) y faltan los secretos — fail-closed independientemente de NODE_ENV exacto", () => {
    for (const valor of ["producción", "PRODUCTION", "Produccion", "staging", "prod"]) {
      expect(() => cargarConfiguracion({ NODE_ENV: valor }), `NODE_ENV=${valor}`).toThrow();
    }
  });

  it("NO lanza con NODE_ENV='development'/'test' sin secretos — genera claves efímeras en memoria", () => {
    expect(() => cargarConfiguracion({ NODE_ENV: "development" })).not.toThrow();
    expect(() => cargarConfiguracion({ NODE_ENV: "test" })).not.toThrow();
    expect(() => cargarConfiguracion({})).not.toThrow(); // sin NODE_ENV -> desarrollo local
  });

  it("las claves efímeras de desarrollo son ESTABLES entre llamadas dentro del mismo proceso (necesario para que JWT firmado en una config se verifique en otra)", () => {
    const a = cargarConfiguracion({ NODE_ENV: "test" });
    const b = cargarConfiguracion({ NODE_ENV: "test" });
    expect(a.jwtSecret).toBe(b.jwtSecret);
    expect(a.cifradoCanalClaves).toBe(b.cifradoCanalClaves);
  });

  it("la clave de cifrado efímera generada en desarrollo es un keyring válido y funcional", () => {
    const config = cargarConfiguracion({ NODE_ENV: "test" });
    const keyring = new KeyringCifradoCanal(config.cifradoCanalClaves);
    const cifrado = keyring.cifrar("texto-de-prueba");
    expect(keyring.descifrar(cifrado)).toBe("texto-de-prueba");
  });

  it("nunca devuelve los antiguos valores por defecto hardcodeados (S-02/S-03) bajo ningún NODE_ENV", () => {
    const config = cargarConfiguracion({ NODE_ENV: "test" });
    expect(config.jwtSecret).not.toBe("desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b");
    expect(config.cifradoCanalClaves).not.toBe("v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
  });

  it("acepta JWT_SECRET/CANAL_CIFRADO_CLAVES explícitos en producción sin lanzar", () => {
    expect(() =>
      cargarConfiguracion({
        NODE_ENV: "production",
        JWT_SECRET: "secreto-de-produccion-real-con-al-menos-32-caracteres",
        CANAL_CIFRADO_CLAVES: "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      }),
    ).not.toThrow();
  });

  it("rechaza un JWT_SECRET explícito pero demasiado corto (entropía insuficiente), incluso en desarrollo", () => {
    expect(() => cargarConfiguracion({ NODE_ENV: "development", JWT_SECRET: "corto" })).toThrow(/entropía insuficiente/);
  });
});

/**
 * Regresión permanente S-11 (docs/auditoria-2/seguridad.md): el campo
 * `entorno` (usado directamente por guards de aplicación como
 * apps/api/src/routes/backoffice/cuentasCanal.ts, "un simulador nunca se
 * presenta como conexión productiva") debe clasificar CUALQUIER variante
 * mal escrita de "production" — y cualquier valor desconocido — como
 * "production", nunca degradar a "development" por no coincidir
 * exactamente con el string "production".
 */
describe("cargarConfiguracion — S-11: entorno se clasifica fail-closed", () => {
  const secretosValidos = {
    JWT_SECRET: "secreto-de-produccion-real-con-al-menos-32-caracteres",
    CANAL_CIFRADO_CLAVES: "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  };

  it("reconoce 'production' exacto", () => {
    expect(cargarConfiguracion({ NODE_ENV: "production", ...secretosValidos }).entorno).toBe("production");
  });

  it("reconoce variantes con acentos/mayúsculas de 'production' como 'production' (antes caían a 'development')", () => {
    for (const valor of ["producción", "PRODUCTION", "Producción", "PRODUCCION"]) {
      expect(cargarConfiguracion({ NODE_ENV: valor, ...secretosValidos }).entorno, `NODE_ENV=${valor}`).toBe(
        "production",
      );
    }
  });

  it("clasifica cualquier valor desconocido (staging, ci, un typo) como 'production' — fail-closed, nunca 'development'", () => {
    for (const valor of ["staging", "ci", "qa", "produciton"]) {
      expect(cargarConfiguracion({ NODE_ENV: valor, ...secretosValidos }).entorno, `NODE_ENV=${valor}`).toBe(
        "production",
      );
    }
  });

  it("reconoce development/desarrollo/dev y test/pruebas/testing explícitamente, con y sin acentos/mayúsculas", () => {
    for (const valor of ["development", "Development", "desarrollo", "DESARROLLO", "dev"]) {
      expect(cargarConfiguracion({ NODE_ENV: valor }).entorno, `NODE_ENV=${valor}`).toBe("development");
    }
    for (const valor of ["test", "Test", "pruebas", "PRUEBAS", "testing"]) {
      expect(cargarConfiguracion({ NODE_ENV: valor }).entorno, `NODE_ENV=${valor}`).toBe("test");
    }
  });

  it("NODE_ENV ausente (undefined) se clasifica como 'development' (D-017, desarrollo local)", () => {
    expect(cargarConfiguracion({}).entorno).toBe("development");
    expect(cargarConfiguracion({ NODE_ENV: undefined }).entorno).toBe("development");
  });
});

/**
 * Regresión permanente — hallazgo NUEVO de la reverificación independiente
 * (docs/auditoria-2/REVERIFICACION.md §3): `NODE_ENV=""` (cadena vacía
 * DEFINIDA, no `undefined`) NO debe activar el camino permisivo de
 * "desarrollo" — es un valor "desconocido" y debe tratarse EXACTAMENTE
 * igual que cualquier otro valor no reconocido ("production" fail-closed).
 * Antes de esta corrección, `leerEntorno`/`exigeSecretosExplicitos` hacían
 * `valor.trim() === ""` equivalente a `valor === undefined`, lo que
 * reabría el bypass de S-02/S-03/S-04/S-11 por una vía no probada por la
 * auditoría original (camino real:
 * apps/api/src/routes/mensajeria/borradores.ts:175, `new
 * SimuladorMensajeria(...)`, sin `entorno`/`ATIENDE_ENTORNO`).
 */
describe("cargarConfiguracion — hallazgo nuevo: NODE_ENV=\"\" (vacío/solo-espacios) es 'desconocido', NUNCA 'development'", () => {
  const secretosValidos = {
    JWT_SECRET: "secreto-de-produccion-real-con-al-menos-32-caracteres",
    CANAL_CIFRADO_CLAVES: "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  };

  it("NODE_ENV='' se clasifica como 'production' (fail-closed), no 'development'", () => {
    expect(cargarConfiguracion({ NODE_ENV: "", ...secretosValidos }).entorno).toBe("production");
  });

  it("NODE_ENV='   ' (solo espacios) se clasifica como 'production' (fail-closed), no 'development'", () => {
    expect(cargarConfiguracion({ NODE_ENV: "   ", ...secretosValidos }).entorno).toBe("production");
  });

  it("NODE_ENV='' exige JWT_SECRET/CANAL_CIFRADO_CLAVES explícitos — lanza si faltan", () => {
    expect(() => cargarConfiguracion({ NODE_ENV: "" })).toThrow(/JWT_SECRET es obligatorio/);
    expect(() => cargarConfiguracion({ NODE_ENV: "  " })).toThrow(/JWT_SECRET es obligatorio/);
  });

  it("undefined sigue siendo el único valor tratado como ausencia (desarrollo local)", () => {
    expect(cargarConfiguracion({ NODE_ENV: undefined }).entorno).toBe("development");
    expect(() => cargarConfiguracion({ NODE_ENV: undefined })).not.toThrow();
  });

  it("matriz completa del invariante: undefined/development/test → laxo; ''/'  '/production/producción → fail-closed", () => {
    const casosLaxos: Array<string | undefined> = [undefined, "development", "test"];
    for (const valor of casosLaxos) {
      expect(() => cargarConfiguracion({ NODE_ENV: valor }), `NODE_ENV=${valor}`).not.toThrow();
    }
    const casosFailClosed = ["", "  ", "production", "producción"];
    for (const valor of casosFailClosed) {
      expect(() => cargarConfiguracion({ NODE_ENV: valor }), `NODE_ENV=${valor}`).toThrow(/obligatorio/);
    }
  });
});
