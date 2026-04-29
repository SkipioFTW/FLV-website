export default function OverlaysLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-full min-h-screen bg-transparent text-foreground relative overflow-hidden">
      {children}
    </div>
  );
}
