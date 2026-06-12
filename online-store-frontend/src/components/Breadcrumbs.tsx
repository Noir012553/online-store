import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "../lib/i18n";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  links: BreadcrumbItem[];
}

export function Breadcrumbs({ links }: BreadcrumbsProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex items-center gap-2 text-sm mb-6">
      <Link
        href="/"
        className="flex items-center gap-1 text-gray-500 hover:text-red-600 transition-colors"
      >
        <Home className="w-4 h-4 text-red-600" />
        <span>{t('home', 'breadcrumbs')}</span>
      </Link>
      {links.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-red-600" />
          {item.href ? (
            <Link
              href={item.href}
              className="text-gray-500 hover:text-red-600 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
