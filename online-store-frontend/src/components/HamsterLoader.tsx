import type { CSSProperties } from 'react';
import styles from '../css/components/HamsterLoader.module.css';

type HamsterLoaderProps = {
  size?: number;
  className?: string;
};

export function HamsterLoader({ size = 144, className = '' }: HamsterLoaderProps) {
  const style = { '--loader-font-size': `${size / 12}px` } as CSSProperties & {
    '--loader-font-size': string;
  };

  return (
    <div
      aria-label="Hamster running in a wheel"
      role="img"
      className={`${styles['wheel-and-hamster']} ${className}`}
      style={style}
    >
      <div className={styles.wheel} />
      <div className={styles.hamster}>
        <div className={styles.hamster__body}>
          <div className={styles.hamster__head}>
            <div className={styles.hamster__ear} />
            <div className={styles.hamster__eye} />
            <div className={styles.hamster__nose} />
          </div>
          <div className={styles['hamster__limb--fr']} />
          <div className={styles['hamster__limb--fl']} />
          <div className={styles['hamster__limb--br']} />
          <div className={styles['hamster__limb--bl']} />
          <div className={styles.hamster__tail} />
        </div>
      </div>
      <div className={styles.spoke} />
    </div>
  );
}
