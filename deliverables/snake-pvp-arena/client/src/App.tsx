import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import GamePage from './pages/GamePage';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import RegisterPage from './pages/RegisterPage';
import StatsPage from './pages/StatsPage';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={token ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <LobbyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/:roomCode"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <StatsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
