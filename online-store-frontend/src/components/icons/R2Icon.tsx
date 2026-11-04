import Image from 'next/image';
import { useState } from 'react';

type R2IconName = 'fire' | 'flash' | 'star';

const iconPaths: Record<R2IconName, string> = {
  fire: '/assets/icons/fire.png',
  flash: '/assets/icons/flash.png',
  star: '/assets/icons/star.png',
};

interface R2IconProps {
  name: R2IconName;
  size: number;
  className?: string;
}

export function R2Icon({ name, size, className }: R2IconProps) {
  const [failed, setFailed] = useState(false);
  const src = iconPaths[name];

  if (!src || failed) return null;

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      className={`shrink-0 object-contain ${className || ''}`}
      onError={() => setFailed(true)}
    />
  );
}
