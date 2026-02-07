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
        { id: "acc1", label: "My SaaS", isActive: true, products: [] },
        { id: "acc2", label: "Side Project", isActive: true, products: [] },
      ],
    },
    {
      id: "gumroad",
      name: "Gumroad",
      icon: "ShoppingBag",
      color: "#ff90e8",
      accounts: [
        {
          id: "acc3",
          label: "Digital Products",
          isActive: true,
          products: [
            { id: "prod1", label: "E-Book" },
            { id: "prod2", label: "Course" },
          ],
        },
      ],
    },
  ];

  it("should show account count on integration pill", () => {
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2", "acc3"])}
        enabledProjectIds={new Set(["prod1", "prod2"])}
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
        enabledAccountIds={new Set(["acc1"])}
        enabledProjectIds={new Set()}
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
        enabledProjectIds={new Set(["prod1", "prod2"])}
        onFilterChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Stripe/));

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
        enabledProjectIds={new Set()}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByText(/Stripe/));
    fireEvent.click(screen.getByText("Deselect all"));

    expect(onFilterChange).toHaveBeenCalled();
    const callArgs = onFilterChange.mock.calls[0];
    const accountIds = callArgs[0];
    expect(accountIds.has("acc1")).toBe(false);
    expect(accountIds.has("acc2")).toBe(false);
  });

  it("should toggle individual accounts and their products", () => {
    const onFilterChange = vi.fn();

    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc1", "acc2", "acc3"])}
        enabledProjectIds={new Set(["prod1", "prod2"])}
        onFilterChange={onFilterChange}
      />
    );

    // Open Gumroad dropdown and disable the account
    fireEvent.click(screen.getByText(/Gumroad/));
    fireEvent.click(screen.getByText("Digital Products"));

    expect(onFilterChange).toHaveBeenCalled();
    const [accountIds, projectIds] = onFilterChange.mock.calls[0];
    // Account disabled
    expect(accountIds.has("acc3")).toBe(false);
    // Products also disabled
    expect(projectIds.has("prod1")).toBe(false);
    expect(projectIds.has("prod2")).toBe(false);
  });

  it("should show product count on accounts with products", () => {
    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc3"])}
        enabledProjectIds={new Set(["prod1", "prod2"])}
        onFilterChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Gumroad/));

    expect(screen.getByText(/2 products/)).toBeInTheDocument();
  });

  it("should not render when no connected integrations", () => {
    const { container } = render(
      <DashboardFilter
        integrations={[]}
        enabledAccountIds={new Set()}
        enabledProjectIds={new Set()}
        onFilterChange={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("should expand account to show products and allow toggling individual products", () => {
    const onFilterChange = vi.fn();

    render(
      <DashboardFilter
        integrations={mockIntegrations}
        enabledAccountIds={new Set(["acc3"])}
        enabledProjectIds={new Set(["prod1", "prod2"])}
        onFilterChange={onFilterChange}
      />
    );

    // Open Gumroad dropdown
    fireEvent.click(screen.getByText(/Gumroad/));

    // Products should not be visible yet (need to expand)
    expect(screen.queryByText("E-Book")).not.toBeInTheDocument();

    // Click the expand chevron for Digital Products account
    const chevrons = screen.getAllByRole("button");
    // Find the expand button (the one with ChevronRight)
    const expandButton = chevrons.find((btn) =>
      btn.querySelector("[class*='lucide-chevron-right']")
    );
    expect(expandButton).toBeDefined();
    fireEvent.click(expandButton!);

    // Now products should be visible
    expect(screen.getByText("E-Book")).toBeInTheDocument();
    expect(screen.getByText("Course")).toBeInTheDocument();

    // Toggle a product
    fireEvent.click(screen.getByText("E-Book"));

    expect(onFilterChange).toHaveBeenCalled();
    const [, projectIds] = onFilterChange.mock.calls[0];
    expect(projectIds.has("prod1")).toBe(false); // toggled off
    expect(projectIds.has("prod2")).toBe(true); // still on
  });
});
