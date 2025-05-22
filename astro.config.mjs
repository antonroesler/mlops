import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://your-domain.com', // Replace with your actual domain
  integrations: [mdx()],
  output: 'static',
});
