import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (!trimmed) return setError('请输入用户名');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed))
      return setError('用户名需为 3-16 位字母、数字或下划线');
    if (password.length < 6) return setError('密码至少 6 位');
    if (password !== confirm) return setError('两次密码输入不一致');

    setSubmitting(true);
    try {
      await register(trimmed, password);
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-6">Snake PvP Arena</h1>
        <h2 className="text-lg text-slate-400 text-center mb-6">注册</h2>

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
          <div>
            <label className="block text-sm text-slate-400 mb-1">确认密码</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-500 transition"
              placeholder="再次输入密码"
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
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          已有账号？{' '}
          <Link to="/login" className="text-orange-400 hover:text-orange-300">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
