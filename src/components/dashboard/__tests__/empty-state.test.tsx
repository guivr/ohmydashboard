import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("should render the empty state message", () => {
    render(<EmptyState />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect your first integration/)
    ).toBeInTheDocument();
  });

  it("should have a link to settings page", () => {
    render(<EmptyState />);

    const link = screen.getByRole("link", {
      name: /Connect an Integration/,
    });
    expect(link).toHaveAttribute("href", "/settings");
  });
});
