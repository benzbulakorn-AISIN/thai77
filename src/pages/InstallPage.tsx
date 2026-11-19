import { InstallCard } from '../features/pwa/InstallCard';

/** #/install — the install card on its own page (a direct link to send to someone, and a fallback if the profile page does not show it) */
export function InstallPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ติดตั้งและใช้งานออฟไลน์</h1>
      <InstallCard />
    </div>
  );
}
