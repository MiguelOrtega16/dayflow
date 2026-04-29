export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Force dark mode synchronously before React hydrates — prevents flash */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');`,
        }}
      />
      {children}
    </>
  )
}
