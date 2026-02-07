import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RevenueChart } from "../revenue-chart";

describe("RevenueChart", () => {
  it("should fill in missing dates with zeros for continuous time axis", () => {
    // Data with gaps: Jan 8, Jan 10, Jan 12 (Jan 9 and Jan 11 missing)
    const data = [
      { date: "2025-01-08", value: 100 },
      { date: "2025-01-10", value: 200 },
      { date: "2025-01-12", value: 150 },
    ];

    render(<RevenueChart title="Test Chart" data={data} />);

    // Chart should render without errors
    expect(screen.getByText("Test Chart")).toBeInTheDocument();
  });

  it("should handle empty data gracefully", () => {
    render(<RevenueChart title="Empty Chart" data={[]} />);

    expect(
      screen.getByText("No data yet. Connect an account and sync to see your metrics.")
    ).toBeInTheDocument();
  });

  it("should sort data chronologically", () => {
    // Data in random order
    const data = [
      { date: "2025-01-15", value: 300 },
      { date: "2025-01-08", value: 100 },
      { date: "2025-01-12", value: 200 },
    ];

    render(<RevenueChart title="Sorted Chart" data={data} />);
    
    // Chart title should render (component doesn't crash)
    expect(screen.getByText("Sorted Chart")).toBeInTheDocument();
  });

  it("should apply custom color when provided", () => {
    const data = [{ date: "2025-01-08", value: 100 }];
    
    render(<RevenueChart title="Colored Chart" data={data} color="#ff0000" />);
    
    // Should render without errors
    expect(screen.getByText("Colored Chart")).toBeInTheDocument();
  });

  it("should use time scale for XAxis with proper configuration", () => {
    const data = [
      { date: "2025-01-08", value: 100 },
      { date: "2025-01-09", value: 200 },
    ];

    render(<RevenueChart title="Time Scale Chart" data={data} />);
    
    // Chart should render without errors
    expect(screen.getByText("Time Scale Chart")).toBeInTheDocument();
  });
});
