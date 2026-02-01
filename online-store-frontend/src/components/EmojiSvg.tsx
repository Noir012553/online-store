import { useEffect, useRef } from 'react';
import twemoji from 'twemoji';

interface EmojiSvgProps {
  emoji: string;
  className?: string;
}

export function EmojiSvg({ emoji, className = '' }: EmojiSvgProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      twemoji.parse(containerRef.current, {
        folder: 'svg',
        ext: '.svg',
      });
    }
  }, [emoji]);

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-center justify-center ${className}`}
      style={{ display: 'inline-flex' }}
    >
      {emoji}
    </span>
  );
}
