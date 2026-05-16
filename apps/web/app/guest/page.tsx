import { redirect } from 'next/navigation';

// Old `/guest` link kept for backward compatibility with any QR codes,
// bookmarks, or saved tabs from the local-test-ui era. The canonical join
// page lives at `/join`. Forwards any `code`/`qrToken` query params.
export default function LegacyGuestPage({
  searchParams,
}: {
  searchParams: { code?: string; qrToken?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.code) params.set('code', searchParams.code);
  if (searchParams.qrToken) params.set('qrToken', searchParams.qrToken);
  const qs = params.toString();
  redirect(qs ? `/join?${qs}` : '/join');
}
