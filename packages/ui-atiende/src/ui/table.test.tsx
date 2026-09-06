import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

describe("Table", () => {
  it("renderiza encabezados y filas", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unidad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Depa 101</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText("Unidad")).toBeInTheDocument();
    expect(screen.getByText("Depa 101")).toBeInTheDocument();
  });
});
