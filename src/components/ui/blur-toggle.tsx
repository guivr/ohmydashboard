"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const BLUR_STORAGE_KEY = "omd-blur-values";

type BlurToggleProps = {
  className?: string;
};

export function BlurToggle({ className }: BlurToggleProps) {
  const [blurred, setBlurred] = useState(false);

  // Read persisted state on mount
  useEffect(() => {
    const stored = localStorage.getItem(BLUR_STORAGE_KEY);
    if (stored === "true") {
      setBlurred(true);
      document.documentElement.classList.add("blur-values");
    }
  }, []);

  const toggle = () => {
    const next = !blurred;
    setBlurred(next);
    if (next) {
      document.documentElement.classList.add("blur-values");
    } else {
      document.documentElement.classList.remove("blur-values");
    }
    localStorage.setItem(BLUR_STORAGE_KEY, String(next));
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("w-full justify-start gap-2", className)}
      onClick={toggle}
      aria-label={blurred ? "Show values" : "Hide values"}
    >
      {blurred ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
      <span>{blurred ? "Show values" : "Hide values"}</span>
    </Button>
  );
}
