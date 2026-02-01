"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#000000",
          "--normal-border": "#e5e7eb",
          "--success-bg": "#f0fdf4",
          "--success-text": "#166534",
          "--success-border": "#86efac",
          "--success-icon-color": "#22c55e",
          "--error-bg": "#fef2f2",
          "--error-text": "#991b1b",
          "--error-border": "#fca5a5",
          "--error-icon-color": "#ef4444",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
