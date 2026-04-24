import './globals.css'

export const metadata = { title: 'Claude Squad' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
