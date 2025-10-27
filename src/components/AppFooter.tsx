import { version } from '../../package.json';

export function AppFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border px-4 py-2 text-xs text-muted-foreground z-10">
      <div className="max-w-screen-2xl mx-auto flex justify-between items-center">
        <span>ROLLPIX Cloudflare Manager</span>
        <span className="font-mono">v{version}</span>
      </div>
    </footer>
  );
}
