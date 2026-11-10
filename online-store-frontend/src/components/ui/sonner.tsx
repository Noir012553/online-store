"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="text-green-500 w-5 h-5" />,
        error: <AlertCircle className="text-red-500 w-5 h-5" />,
        info: <Info className="text-blue-500 w-5 h-5" />,
        warning: <AlertTriangle className="text-yellow-500 w-5 h-5" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
