import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MetricCard } from "../metric-card";
import type { RankingEntry } from "../metric-card";

describe("MetricCard", () => {
  // ─── Core rendering ────────────────────────────────────────────────────────

  it("should render currency value", () => {
    render(
      <MetricCard title="Total Revenue" value={1234.56} format="currency" />
    );

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
  });

  it("should render number value", () => {
    render(
      <MetricCard title="Active Users" value={5432} format="number" />
    );

    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("5,432")).toBeInTheDocument();
  });

  it("should render percentage value", () => {
    render(
      <MetricCard title="Conversion Rate" value={3.5} format="percentage" />
    );

    expect(screen.getByText("3.5%")).toBeInTheDocument();
  });

  it("should show positive trend when value increased", () => {
    render(
      <MetricCard
        title="Revenue"
        value={150}
        previousValue={100}
        format="currency"
      />
    );

    expect(screen.getByText("+50.0%")).toBeInTheDocument();
  });

  it("should show negative trend when value decreased", () => {
    render(
      <MetricCard
        title="Revenue"
        value={75}
        previousValue={100}
        format="currency"
      />
    );

    expect(screen.getByText("-25.0%")).toBeInTheDocument();
  });

  it("should render description text", () => {
    render(
      <MetricCard
        title="MRR"
        value={1000}
        format="currency"
        description="monthly recurring"
      />
    );

    expect(screen.getByText("monthly recurring")).toBeInTheDocument();
  });

  it("should render with custom currency", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1000}
        format="currency"
        currency="EUR"
      />
    );

    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  // ─── Ranking tests ──────────────────────────────────────────────────────────

  const multiRanking: RankingEntry[] = [
    { label: "My SaaS", integrationName: "Stripe", value: 800, percentage: 53.3 },
    { label: "Side Project", integrationName: "Stripe", value: 500, percentage: 33.3 },
    { label: "Consulting", integrationName: "Gumroad", value: 200, percentage: 13.3 },
  ];

  it("should show top source crown badge when ranking has multiple entries", () => {
    render(
      <MetricCard
        title="Total Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    // Crown badge shows the leader
    expect(screen.getByText("My SaaS")).toBeInTheDocument();
    expect(screen.getByText(/53% via Stripe/)).toBeInTheDocument();
  });

  it("should not show crown badge when ranking has only one entry", () => {
    const singleRanking: RankingEntry[] = [
      { label: "Only Account", integrationName: "Stripe", value: 1000, percentage: 100 },
    ];

    render(
      <MetricCard
        title="Total Revenue"
        value={1000}
        format="currency"
        ranking={singleRanking}
      />
    );

    // Single account — no crown badge, not interactive
    const card = screen.getByText("Total Revenue").closest("[class*='card']")!;
    expect(card.className).not.toContain("cursor-pointer");
  });

  it("should show overlay dropdown when clicking card with ranking", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Total Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    // Dropdown not visible yet
    expect(screen.queryByText("Source leaderboard")).not.toBeInTheDocument();

    // Click the card to open dropdown
    const card = screen.getByText("Total Revenue").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    // Dropdown overlay is visible
    expect(screen.getByText("Source leaderboard")).toBeInTheDocument();

    // Rank badges: 1, 2, 3
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    // Account names in leaderboard (My SaaS also in crown badge)
    const mySaasEls = screen.getAllByText("My SaaS");
    expect(mySaasEls.length).toBe(2); // crown badge + dropdown
    expect(screen.getByText("Side Project")).toBeInTheDocument();
    expect(screen.getByText("Consulting")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should close dropdown when clicking card again", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Total Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    const card = screen.getByText("Total Revenue").closest("[class*='card']")!;

    // Open
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByText("Source leaderboard")).toBeInTheDocument();

    // Close
    fireEvent.click(card);
    // Dropdown is removed from DOM
    expect(screen.queryByText("Source leaderboard")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should format ranking values as currency in the dropdown", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText("$800")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$200")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should format ranking values as numbers for number format", () => {
    vi.useFakeTimers();

    const numberRanking: RankingEntry[] = [
      { label: "Account A", integrationName: "Stripe", value: 1200, percentage: 60 },
      { label: "Account B", integrationName: "Stripe", value: 800, percentage: 40 },
    ];

    render(
      <MetricCard
        title="Customers"
        value={2000}
        format="number"
        ranking={numberRanking}
      />
    );

    const card = screen.getByText("Customers").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText("1,200")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should not be interactive without ranking", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1000}
        format="currency"
      />
    );

    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    expect(card.className).not.toContain("cursor-pointer");
  });

  it("should show percentage values in the dropdown", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText("53.3%")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.getByText("13.3%")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should show integration logos in the dropdown", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    // Integration logos are rendered with aria-label
    const stripeLogos = screen.getAllByLabelText("Stripe logo");
    expect(stripeLogos.length).toBe(2); // two Stripe accounts
    expect(screen.getByLabelText("Gumroad logo")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should use custom rankingLabel in dropdown header", () => {
    vi.useFakeTimers();

    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
        rankingLabel="Product leaderboard"
      />
    );

    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    fireEvent.click(card);
    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText("Product leaderboard")).toBeInTheDocument();
    expect(screen.queryByText("Source leaderboard")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should show change indicator with description when previousValue is provided", () => {
    render(
      <MetricCard
        title="Revenue"
        value={150}
        previousValue={100}
        format="currency"
        description="vs previous 30 days"
      />
    );

    expect(screen.getByText("+50.0%")).toBeInTheDocument();
    expect(screen.getByText("vs previous 30 days")).toBeInTheDocument();
  });

  // ─── Loading / skeleton tests ───────────────────────────────────────────────

  it("should show skeleton shimmer when loading", () => {
    const { container } = render(
      <MetricCard
        title="Total Revenue"
        value={0}
        format="currency"
        loading
      />
    );

    // Title is still visible
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    // Value should NOT be shown
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    // Skeleton elements should be present
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  it("should not show ranking when loading", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
        loading
      />
    );

    // Crown badge should not appear while loading
    expect(screen.queryByText("My SaaS")).not.toBeInTheDocument();
    // Card should not be clickable while loading
    const card = screen.getByText("Revenue").closest("[class*='card']")!;
    expect(card.className).not.toContain("cursor-pointer");
  });
});
