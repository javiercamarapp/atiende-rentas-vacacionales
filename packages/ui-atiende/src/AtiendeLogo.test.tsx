import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AtiendeMark, AtiendeWordmark } from "./AtiendeLogo";

describe("AtiendeMark", () => {
  it("renderiza el SVG del glifo", () => {
    const { container } = render(<AtiendeMark />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("AtiendeWordmark", () => {
  it("renderiza el mark y el texto 'atiende'", () => {
    const { container, getByText } = render(<AtiendeWordmark />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(getByText("atiende")).toBeInTheDocument();
  });
});
