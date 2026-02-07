"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ArrowRight } from "lucide-react";
import Link from "next/link";

export function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <LayoutDashboard className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No data yet</h3>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Connect your first integration to start seeing your business metrics
          all in one place.
        </p>
        <Button asChild>
          <Link href="/settings">
            Connect an Integration
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
