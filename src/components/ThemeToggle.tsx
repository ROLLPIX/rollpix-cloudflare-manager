"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Show a placeholder while mounting to prevent hydration mismatch
  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled className="w-9 h-9">
        <Sun className="h-4 w-4" />
        <span className="sr-only">Cargando tema...</span>
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-9 h-9 relative"
      title={`Cambiar a tema ${isDark ? "claro" : "oscuro"}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-all" />
      ) : (
        <Moon className="h-4 w-4 transition-all" />
      )}
      <span className="sr-only">
        {isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      </span>
    </Button>
  );
}