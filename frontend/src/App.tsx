import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/layout/Layout';
import ProtectedRoute from './routes/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import ShipmentsPage from './pages/ShipmentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AiChatPage from './pages/AiChatPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="shipments" element={<ShipmentsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="chat" element={<AiChatPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
