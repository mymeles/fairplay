import { redirect } from 'next/navigation';

export default function HostSessionIndexPage({
  params,
}: {
  params: { sessionId: string };
}) {
  redirect(`/host/sessions/${params.sessionId}/dashboard`);
}
