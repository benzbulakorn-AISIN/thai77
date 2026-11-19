import { createHashRouter, Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { HomePage } from '../pages/HomePage';
import { ExplorePage } from '../pages/ExplorePage';
import { SearchPage } from '../pages/SearchPage';
import { ProvincePage } from '../pages/ProvincePage';
import { PlaceDetailPage } from '../pages/PlaceDetailPage';
import { CartPage } from '../pages/CartPage';
import { TripsPage } from '../pages/TripsPage';
import { CalendarPage } from '../pages/CalendarPage';
import { TripPage } from '../pages/TripPage';
import { SharedTripPage } from '../pages/SharedTripPage';
import { BudgetPage } from '../pages/BudgetPage';
import { MemoriesPage } from '../pages/MemoriesPage';
import { MemoryDetailPage } from '../pages/MemoryDetailPage';
import { MyPlacesPage } from '../pages/MyPlacesPage';
import { BackupPage } from '../pages/BackupPage';
import { ProfilePage } from '../pages/ProfilePage';
import { AdminShell } from '../pages/admin/AdminShell';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminPlacesPage } from '../pages/admin/AdminPlacesPage';
import { AdminPlaceEditPage } from '../pages/admin/AdminPlaceEditPage';
import { AdminPlaceImagesPage } from '../pages/admin/AdminPlaceImagesPage';
import { AdminCategoriesPage } from '../pages/admin/AdminCategoriesPage';
import { AdminReviewPage } from '../pages/admin/AdminReviewPage';
import { AdminImportPage } from '../pages/admin/AdminImportPage';
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
  // public read-only share page: OUTSIDE the app shell (no menu, no cart bar, no sign-in needed)
  { path: '/s/:token', element: <SharedTripPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/province/:slug', element: <ProvincePage /> },
      { path: '/place/:id', element: <PlaceDetailPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/trips', element: <TripsPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/trips/:id', element: <TripPage /> },
      { path: '/trips/:id/budget', element: <BudgetPage /> },
      { path: '/memories', element: <MemoriesPage /> },
      { path: '/memories/:id', element: <MemoryDetailPage /> },
      { path: '/my-places', element: <MyPlacesPage /> },
      { path: '/backup', element: <BackupPage /> },
      { path: '/profile', element: <ProfilePage /> },
      {
        path: '/admin',
        element: <AdminShell />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'places', element: <AdminPlacesPage /> },
          { path: 'places/new', element: <AdminPlaceEditPage /> },
          { path: 'places/:id/images', element: <AdminPlaceImagesPage /> },
          { path: 'places/:id', element: <AdminPlaceEditPage /> },
          { path: 'import', element: <AdminImportPage /> },
          { path: 'categories', element: <AdminCategoriesPage /> },
          { path: 'review', element: <AdminReviewPage /> },
        ],
      },
      { path: '/auth/login', element: <LoginPage /> },
      { path: '/auth/reset', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
