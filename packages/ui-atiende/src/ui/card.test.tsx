import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardContent } from "./card";

describe("Card", () => {
  it("renderiza título y contenido", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Propiedades</CardTitle>
        </CardHeader>
        <CardContent>Sin unidades todavía.</CardContent>
      </Card>,
    );
    expect(screen.getByText("Propiedades")).toBeInTheDocument();
    expect(screen.getByText("Sin unidades todavía.")).toBeInTheDocument();
  });
});
