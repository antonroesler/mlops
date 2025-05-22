import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://blog.antonroesler.com',
  integrations: [mdx()],
  output: 'static',
});
