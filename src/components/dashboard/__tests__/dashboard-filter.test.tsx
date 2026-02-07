import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardFilter } from "../dashboard-filter";

describe("DashboardFilter", () => {
  const mockIntegrations = [
    {
      id: "stripe",
      name: "Stripe",
      icon: "CreditCard",
      color: "#635BFF",
      accounts: [
        { id: "acc1", label: "My SaaS", isActive: true },
        { id: "acc2", label: "Side Project", isActive: true },
      ],
    },
    {
      id: "gumroad",
      name: "Gumroad",
      icon: "ShoppingBag",
      color: "#ff90e8",
      accounts: [
        { id: "acc3", label: "Digital Products", isActive: true },
      ],
    },
  ];

  it("should show account count on integration pill", () => {
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2", "acc3"])}
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Stripe/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 accounts\)/)).toBeInTheDocument();
  });

  it("should show partial count when some accounts disabled", () => {
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1"])} // Only 1 of 2 Stripe accounts
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.getByText(/1\/2 accounts/)).toBeInTheDocument();
  });

  it("should open dropdown when clicking integration pill", () => {
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2", "acc3"])}
        onFilterChange={vi.fn()}
      />
    );

    // Click on Stripe pill
    fireEvent.click(screen.getByText(/Stripe/));

    // Dropdown should show with "Select all" and account names
    expect(screen.getByText("Deselect all")).toBeInTheDocument();
    expect(screen.getByText("My SaaS")).toBeInTheDocument();
    expect(screen.getByText("Side Project")).toBeInTheDocument();
  });

  it("should toggle all accounts via Select all / Deselect all", () => {
    const onFilterChange = vi.fn();
    
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2"])}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByText(/Stripe/));
    fireEvent.click(screen.getByText("Deselect all"));

    expect(onFilterChange).toHaveBeenCalled();
    const callArg = onFilterChange.mock.calls[0][0];
    expect(callArg.has("acc1")).toBe(false);
    expect(callArg.has("acc2")).toBe(false);
  });

  it("should toggle individual accounts", () => {
    const onFilterChange = vi.fn();
    
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2"])}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByText(/Stripe/));
    fireEvent.click(screen.getByText("My SaaS"));

    expect(onFilterChange).toHaveBeenCalled();
  });

  it("should not render when no connected integrations", () => {
    const { container } = render(
      <DashboardFilter
        integrations={[]}
        enabledAccountIds={new Set()}
        onFilterChange={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
