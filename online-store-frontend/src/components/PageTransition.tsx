'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';

export const PandaRolling = () => {
  const [isClient, setIsClient] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div className="flex flex-col items-center justify-center" />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-32 h-12 flex items-center justify-center">
        <motion.div
          animate={{
            rotate: 360,
            x: [-60, 60],
          }}
          transition={{
            rotate: { repeat: Infinity, duration: 1, ease: "linear" },
            x: { repeat: Infinity, duration: 2, ease: "easeInOut", repeatType: "reverse" }
          }}
          className="text-6xl absolute"
        >
          🐼
        </motion.div>
      </div>
      <div className="flex items-center gap-3 mt-6">
        <motion.span
          animate={{ rotate: [-5, 5, -5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-2xl origin-bottom"
        >
          🎋
        </motion.span>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="font-bold text-lg text-green-500 tracking-wide"
        >
          {t('loading_wait', 'common')}
        </motion.p>
        <motion.span
          animate={{ rotate: [5, -5, 5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-2xl origin-bottom"
        >
          🎋
        </motion.span>
      </div>
    </div>
  );
};

export const PageTransition = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
};
