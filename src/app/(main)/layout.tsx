import ActivityTracker from "@/components/ActivityTracker";
import AIAnalyst from "@/components/AIAnalyst";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen main-layout-bg text-foreground">
      <ActivityTracker />
      {/* Main Content */}
      <main className="relative z-10">
        {children}
      </main>

      {/* AI League Analyst */}
      <AIAnalyst />

      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-val-red/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-val-blue/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
