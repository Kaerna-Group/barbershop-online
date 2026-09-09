import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingState } from '../shared/ui/ui'

const HomePage = lazy(() => import('../pages/home-page'))
const MyBookingsPage = lazy(() => import('../pages/my-bookings-page'))
const AdminLoginPage = lazy(() => import('../pages/admin-login-page'))
const AdminPage = lazy(() => import('../pages/admin-page'))
const NotFoundPage = lazy(() => import('../pages/not-found-page'))

export function AppRouter() {
  return (
    <Suspense
      fallback={
        <main className="page-center">
          <LoadingState />
        </main>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route
          path="/booking/success"
          element={<Navigate to="/my-bookings" replace />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
