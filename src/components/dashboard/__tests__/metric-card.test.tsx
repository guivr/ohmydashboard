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
  const longRanking: RankingEntry[] = [
    { label: "Alpha", integrationName: "Stripe", value: 900, percentage: 30 },
    { label: "Beta", integrationName: "Stripe", value: 800, percentage: 26.7 },
    { label: "Gamma", integrationName: "Gumroad", value: 700, percentage: 23.3 },
    { label: "Delta", integrationName: "Shopify", value: 300, percentage: 10 },
    { label: "Epsilon", integrationName: "Shopify", value: 200, percentage: 6.7 },
    { label: "Zeta", integrationName: "Lemon Squeezy", value: 100, percentage: 3.3 },
    { label: "Eta", integrationName: "PayPal", value: 50, percentage: 1.7 },
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

  it("should show breakdown when clicking 'Show breakdown' button", () => {
    render(
      <MetricCard
        title="Total Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    // Breakdown not visible yet
    expect(screen.queryByText("Side Project")).not.toBeInTheDocument();

    // Click the "Show breakdown" button to expand
    const breakdownBtn = screen.getByText("Show breakdown");
    fireEvent.click(breakdownBtn);

    // Rank badges: 1, 2, 3
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    // Account names in leaderboard (My SaaS also in crown badge)
    const mySaasEls = screen.getAllByText("My SaaS");
    expect(mySaasEls.length).toBe(2); // crown badge + breakdown
    expect(screen.getByText("Side Project")).toBeInTheDocument();
    expect(screen.getByText("Consulting")).toBeInTheDocument();
  });

  it("should show top 5 entries and allow expanding remaining rankings", () => {
    render(
      <MetricCard
        title="Total Revenue"
        value={3050}
        format="currency"
        ranking={longRanking}
      />
    );

    // Open the breakdown
    fireEvent.click(screen.getByText("Show breakdown"));

    // Alpha appears twice: crown badge + breakdown
    const alphaEls = screen.getAllByText("Alpha");
    expect(alphaEls.length).toBe(2);
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText("Delta")).toBeInTheDocument();
    expect(screen.getByText("Epsilon")).toBeInTheDocument();
    expect(screen.queryByText("Zeta")).not.toBeInTheDocument();
    expect(screen.queryByText("Eta")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Expand (2 others)" });
    fireEvent.click(expandButton);

    expect(screen.getByText("Zeta")).toBeInTheDocument();
    expect(screen.getByText("Eta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("should collapse breakdown when clicking button again", () => {
    render(
      <MetricCard
        title="Total Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    const breakdownBtn = screen.getByText("Show breakdown");

    // Open
    fireEvent.click(breakdownBtn);
    expect(screen.getByText("Side Project")).toBeInTheDocument();
    expect(screen.getByText("Hide breakdown")).toBeInTheDocument();

    // Close
    fireEvent.click(screen.getByText("Hide breakdown"));
    // Breakdown entries are removed from DOM
    expect(screen.queryByText("Side Project")).not.toBeInTheDocument();
  });

  it("should format ranking values as currency in the breakdown", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    expect(screen.getByText("$800")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$200")).toBeInTheDocument();
  });

  it("should format ranking values as numbers for number format", () => {
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

    fireEvent.click(screen.getByText("Show breakdown"));

    expect(screen.getByText("1,200")).toBeInTheDocument();
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

  it("should show percentage values in the breakdown", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    expect(screen.getByText("53.3%")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.getByText("13.3%")).toBeInTheDocument();
  });

  it("should show integration logos in the breakdown", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
      />
    );

    fireEvent.click(screen.getByText("Show breakdown"));

    // Integration logos are rendered with aria-label
    const stripeLogos = screen.getAllByLabelText("Stripe logo");
    expect(stripeLogos.length).toBe(2); // two Stripe accounts
    expect(screen.getByLabelText("Gumroad logo")).toBeInTheDocument();
  });

  it("should render breakdown with custom rankingLabel prop (accepted but not displayed as header)", () => {
    render(
      <MetricCard
        title="Revenue"
        value={1500}
        format="currency"
        ranking={multiRanking}
        rankingLabel="Product leaderboard"
      />
    );

    // rankingLabel prop is accepted without error; breakdown still functions
    fireEvent.click(screen.getByText("Show breakdown"));

    // All ranking entries are rendered correctly
    const mySaasEls = screen.getAllByText("My SaaS");
    expect(mySaasEls.length).toBe(2); // crown badge + breakdown
    expect(screen.getByText("Side Project")).toBeInTheDocument();
    expect(screen.getByText("Consulting")).toBeInTheDocument();
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
    // The description is rendered alongside the previous value in a single <p>
    expect(screen.getByText(/vs previous 30 days/)).toBeInTheDocument();
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
