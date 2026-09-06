import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { StatCard, TrendStatCard } from "./StatCard";

describe("StatCard", () => {
  it("renderiza etiqueta, valor y nota", () => {
    render(<StatCard icon={Building2} label="Unidades" value="0" nota="Sin datos todavía" />);
    expect(screen.getByText("Unidades")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Sin datos todavía")).toBeInTheDocument();
  });
});

describe("TrendStatCard", () => {
  it("renderiza el delta con signo positivo", () => {
    render(<TrendStatCard icon={Building2} label="Ocupación" value="0%" deltaPct={0} />);
    expect(screen.getByText("Ocupación")).toBeInTheDocument();
    expect(screen.getByText("0%", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("+0.0%")).toBeInTheDocument();
  });
});
