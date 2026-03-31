import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Game from './components/Game';
import './App.css';

function App() {
  const [user, setUser] = useState<string | null>(localStorage.getItem('username'));

  const handleLogin = (username: string) => {
    localStorage.setItem('username', username);
    setUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUser(null);
  };

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Snake Game Web</h1>
          {user && (
            <div>
              Welcome, {user}! <button onClick={handleLogout}>Logout</button>
            </div>
          )}
        </header>
        <main>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/game" /> : <Login onLogin={handleLogin} />} />
            <Route path="/register" element={user ? <Navigate to="/game" /> : <Register />} />
            <Route path="/game" element={user ? <Game username={user} /> : <Navigate to="/login" />} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
