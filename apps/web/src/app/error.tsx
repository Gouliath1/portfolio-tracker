'use client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  console.error('Global error boundary caught:', error);
  return (
    <html>
      <body>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-gray-900">Something went wrong</h1>
            <p className="text-gray-600">Please try again later.</p>
            {error?.message && (
              <p className="text-sm text-gray-400">{error.message}</p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
