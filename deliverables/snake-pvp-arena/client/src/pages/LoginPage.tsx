import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) return setError('请输入用户名');
    if (!password) return setError('请输入密码');

    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-6">Snake PvP Arena</h1>
        <h2 className="text-lg text-slate-400 text-center mb-6">登录</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 transition"
              placeholder="3-16 位字母/数字/下划线"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 transition"
              placeholder="至少 6 位"
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 rounded-lg font-semibold transition"
          >
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          没有账号？{' '}
          <Link to="/register" className="text-orange-400 hover:text-orange-300">
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
