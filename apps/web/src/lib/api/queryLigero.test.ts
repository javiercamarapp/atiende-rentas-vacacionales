import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMutacionLigera } from "./queryLigero";

describe("useMutacionLigera", () => {
  it("ejecuta siempre el `fn` del render más reciente, nunca el closure del primer render", async () => {
    const { result, rerender } = renderHook(({ valor }: { valor: string }) => useMutacionLigera(() => Promise.resolve(valor)), {
      initialProps: { valor: "primero" },
    });

    rerender({ valor: "segundo" });

    await act(async () => {
      await result.current.ejecutar();
    });

    expect(result.current.datos).toBe("segundo");
  });

  it("mantiene la identidad de `ejecutar` estable entre renders", () => {
    const { result, rerender } = renderHook(({ valor }: { valor: string }) => useMutacionLigera(() => Promise.resolve(valor)), {
      initialProps: { valor: "a" },
    });

    const primeraReferencia = result.current.ejecutar;
    rerender({ valor: "b" });

    expect(result.current.ejecutar).toBe(primeraReferencia);
  });
});
