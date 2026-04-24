import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Squad</span>,
  project: {
    link: 'https://github.com/your-username/squad',
  },
  docsRepositoryBase: 'https://github.com/your-username/squad/tree/main/apps/docs',
  footer: {
    text: 'Squad — self-hosted multiplayer dev platform. MIT License.',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Squad self-hosted setup and usage documentation" />
    </>
  ),
  useNextSeoProps() {
    return { titleTemplate: '%s – Squad Docs' }
  },
}

export default config
