import { Navigate, Route, Routes } from 'react-router-dom';
import Auth from '../components/Auth';
import AdminLayout from '../components/admin/AdminLayout';
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminKeyPool from '../components/admin/AdminKeyPool';
import AdminUsers from '../components/admin/AdminUsers';
import AdminPlans from '../components/admin/AdminPlans';
import AdminRedemption from '../components/admin/AdminRedemption';
import AdminModels from '../components/admin/AdminModels';
import AdminAnnouncements from '../components/admin/AdminAnnouncements';
import AppLayout from './layout/AppLayout';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="keys" element={<AdminKeyPool />} />
        <Route path="models" element={<AdminModels />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="redemption" element={<AdminRedemption />} />
      </Route>
      <Route path="/" element={<AppLayout />} />
      <Route path="/chats" element={<AppLayout />} />
      <Route path="/customize" element={<AppLayout />} />
      <Route path="/cowork/customize" element={<AppLayout />} />
      <Route path="/code/customize" element={<AppLayout />} />
      <Route path="/projects" element={<AppLayout />} />
      <Route path="/cowork/projects" element={<AppLayout />} />
      <Route path="/code/projects" element={<AppLayout />} />
      <Route path="/artifacts" element={<AppLayout />} />
      <Route path="/cowork" element={<AppLayout />} />
      <Route path="/cowork/:id" element={<AppLayout />} />
      <Route path="/code" element={<AppLayout />} />
      <Route path="/code/:id" element={<AppLayout />} />
      <Route path="/scheduled" element={<AppLayout />} />
      <Route path="/chat/:id" element={<AppLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
