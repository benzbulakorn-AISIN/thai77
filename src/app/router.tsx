import { createHashRouter, Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { HomePage } from '../pages/HomePage';
import { ProvincePage } from '../pages/ProvincePage';
import { PlaceDetailPage } from '../pages/PlaceDetailPage';
import { CartPage } from '../pages/CartPage';
import { TripsPage } from '../pages/TripsPage';
import { TripPage } from '../pages/TripPage';
import { BudgetPage } from '../pages/BudgetPage';
import { MemoriesPage } from '../pages/MemoriesPage';
import { MemoryDetailPage } from '../pages/MemoryDetailPage';
import { MyPlacesPage } from '../pages/MyPlacesPage';
import { ExplorePage } from '../pages/Placeholders';
import { ProfilePage } from '../pages/ProfilePage';
import { AdminShell } from '../pages/admin/AdminShell';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminPlacesPage } from '../pages/admin/AdminPlacesPage';
import { AdminPlaceEditPage } from '../pages/admin/AdminPlaceEditPage';
import { AdminCategoriesPage } from '../pages/admin/AdminCategoriesPage';
import { AdminReviewPage } from '../pages/admin/AdminReviewPage';
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
      { path: '/place/:id', element: <PlaceDetailPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/trips', element: <TripsPage /> },
      { path: '/trips/:id', element: <TripPage /> },
      { path: '/trips/:id/budget', element: <BudgetPage /> },
      { path: '/memories', element: <MemoriesPage /> },
      { path: '/memories/:id', element: <MemoryDetailPage /> },
      { path: '/my-places', element: <MyPlacesPage /> },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/profile', element: <ProfilePage /> },
      {
        path: '/admin',
        element: <AdminShell />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'places', element: <AdminPlacesPage /> },
          { path: 'places/new', element: <AdminPlaceEditPage /> },
          { path: 'places/:id', element: <AdminPlaceEditPage /> },
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
