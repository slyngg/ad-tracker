import PageShell from './PageShell';

interface PlaceholderPageProps {
  title: string;
  section?: string;
}

export default function PlaceholderPage({ title, section }: PlaceholderPageProps) {
  return (
    <PageShell title={title} subtitle={section}>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-ats-card border border-ats-border rounded-2xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-lg font-bold text-ats-text mb-2">Coming Soon</h2>
          <p className="text-sm text-ats-text-muted">
            {title} is under development and will be available in an upcoming release.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
