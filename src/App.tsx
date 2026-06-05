import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Layout from './components/Layout';
import FinancieroLayout from './components/FinancieroLayout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Projects from './pages/Projects';
import Collaborators from './pages/Collaborators';
import PlanTrabajo from './pages/PlanTrabajo';
import Board from './pages/Board';
import Admin from './pages/Admin';
import Clients from './pages/Clients';
import Tags from './pages/Tags';
import Home from './pages/Home';
import Facturas from './pages/Financiero/Facturas';
import Dashboard from './pages/Financiero/Dashboard';

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            <Route path="/" element={<Home />} />
            
            <Route element={<Layout />}>
              <Route path="projects" element={<Projects />} />
              <Route path="collaborators" element={<Collaborators />} />
              <Route path="plan-trabajo" element={<PlanTrabajo />} />
              <Route path="board/:projectId" element={<Board />} />
              <Route path="admin" element={<Admin />} />
              <Route path="clients" element={<Clients />} />
              <Route path="tags" element={<Tags />} />
            </Route>

            <Route path="financiero" element={<FinancieroLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="facturas" element={<Facturas />} />
              <Route path="clients" element={<Clients />} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
