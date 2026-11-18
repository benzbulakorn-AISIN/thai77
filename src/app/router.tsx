import { createHashRouter, Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { HomePage } from '../pages/HomePage';
import { ProvincePage } from '../pages/ProvincePage';
import { ExplorePage, MemoriesPage, TripsPage } from '../pages/Placeholders';
import { ProfilePage } from '../pages/ProfilePage';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';

const NotFound = () => (
  <div className="py-16 text-center">
    <p className="mb-4 text-lg">ไม่พบหน้านี้</p>
    <Link to="/" className="text-primary underline">กลับหน้าแรก</Link>
  </div>
);

// HashRouter => refresh on any route never 404s on GitHub Pages
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/province/:slug', element: <ProvincePage /> },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/trips', element: <TripsPage /> },
      { path: '/memories', element: <MemoriesPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/auth/login', element: <LoginPage /> },
      { path: '/auth/reset', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
