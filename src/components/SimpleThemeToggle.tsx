"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function SimpleThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="inline-flex items-center justify-center w-9 h-9 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50" disabled>
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center justify-center w-9 h-9 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      title={`Cambiar a tema ${isDark ? "claro" : "oscuro"}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-gray-700 dark:text-gray-200" />
      ) : (
        <Moon className="h-4 w-4 text-gray-700 dark:text-gray-200" />
      )}
    </button>
  );
}