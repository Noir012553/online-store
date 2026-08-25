import { ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { useTranslation } from "../lib/context/LanguageContext";

export function ScrollToTop() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-transform duration-300">
      <Button
        onClick={scrollToTop}
        size="icon"
        className="bg-red-600 hover:bg-red-700 shadow-lg rounded-full w-12 h-12 transition-all duration-300 hover:scale-110"
        aria-label={t('scroll_to_top', 'components')}
        title={t('scroll_to_top', 'components')}
      >
        <ArrowUp className="w-5 h-5" />
      </Button>
    </div>
  );
}
