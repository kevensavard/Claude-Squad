import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>Claude Squad</span>,
  project: {
    link: 'https://github.com/kevensavard/Claude-Squad',
  },
  docsRepositoryBase: 'https://github.com/kevensavard/Claude-Squad/tree/main/apps/docs',
  footer: {
    text: 'Claude Squad — self-hosted multiplayer AI coding platform. MIT License.',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Claude Squad — self-hosted setup and usage documentation" />
    </>
  ),
  useNextSeoProps() {
    return { titleTemplate: '%s – Claude Squad Docs' }
  },
}

export default config
