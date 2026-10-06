import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/styles/**/*.{css,js,ts}',
  ],
  theme: {
    extend: {
      spacing: {
        'container-px': 'var(--container-padding-x, 1rem)', // 1rem = 4 (px-4), thay đổi giá trị ở CSS
      },
    },
  },
  presets: [],
};

export default config;
