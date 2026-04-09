import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PublicUser {
  id: string;
  username: string;
  bestScore: number;
  wins: number;
  losses: number;
}

interface MatchParticipant {
  userId: string;
  username: string;
  score: number;
  outcome: 'win' | 'loss' | 'draw';
}

interface MatchRecord {
  id: string;
  roomCode: string;
  playedAt: string;
  winnerUsername: string | null;
  reason: string;
  participants: MatchParticipant[];
}

interface ProfilePayload {
  user: PublicUser;
  recentMatches: MatchRecord[];
}

export default function StatsPage() {
  const { token, user: authUser } = useAuth();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<PublicUser[]>([]);
  const [tab, setTab] = useState<'me' | 'leaderboard'>('me');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!token) return;
    fetch('/api/stats/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (tab !== 'leaderboard' || !token) return;
    fetch(`/api/leaderboard?offset=${page * 20}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((data) => setLeaderboard(data.users ?? []))
      .catch(() => {});
  }, [tab, page, token]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-slate-400 hover:text-white transition">
          &larr; 返回大厅
        </Link>
        <h1 className="text-lg font-bold text-orange-400">战绩</h1>
        <div className="w-16" />
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setTab('me')}
          className={`flex-1 py-3 text-center font-semibold transition ${
            tab === 'me' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500'
          }`}
        >
          我的战绩
        </button>
        <button
          onClick={() => { setTab('leaderboard'); setPage(0); }}
          className={`flex-1 py-3 text-center font-semibold transition ${
            tab === 'leaderboard' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500'
          }`}
        >
          排行榜
        </button>
      </div>

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {tab === 'me' && profile && (
          <div className="space-y-6">
            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="最高分" value={profile.user.bestScore} />
              <StatCard label="胜场" value={profile.user.wins} color="text-green-400" />
              <StatCard label="负场" value={profile.user.losses} color="text-red-400" />
            </div>

            {/* Win rate */}
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-sm text-slate-400 mb-2">胜率</div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                {(profile.user.wins + profile.user.losses > 0) && (
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
                    style={{
                      width: `${(profile.user.wins / (profile.user.wins + profile.user.losses)) * 100}%`
                    }}
                  />
                )}
              </div>
              <div className="text-right text-sm text-slate-500 mt-1">
                {profile.user.wins + profile.user.losses > 0
                  ? `${Math.round((profile.user.wins / (profile.user.wins + profile.user.losses)) * 100)}%`
                  : '暂无对局'}
              </div>
            </div>

            {/* Recent matches */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3">最近对局</h3>
              {profile.recentMatches.length === 0 ? (
                <p className="text-slate-600 text-sm">暂无对局记录</p>
              ) : (
                <div className="space-y-2">
                  {profile.recentMatches.map((match) => {
                    const me = match.participants.find((p) => p.userId === authUser?.id);
                    return (
                      <div
                        key={match.id}
                        className="bg-slate-800 rounded-lg px-4 py-3 flex items-center justify-between"
                      >
                        <div>
                          <span
                            className={`text-sm font-semibold ${
                              me?.outcome === 'win'
                                ? 'text-green-400'
                                : me?.outcome === 'loss'
                                  ? 'text-red-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            {me?.outcome === 'win' ? '胜' : me?.outcome === 'loss' ? '负' : '平'}
                          </span>
                          <span className="text-slate-500 text-sm ml-3">
                            vs{' '}
                            {match.participants
                              .filter((p) => p.userId !== authUser?.id)
                              .map((p) => p.username)
                              .join(', ') || '—'}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-orange-400 font-mono">{me?.score ?? 0}</div>
                          <div className="text-xs text-slate-600">{formatDate(match.playedAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'leaderboard' && (
          <div>
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="px-4 py-3 text-left w-12">#</th>
                    <th className="px-4 py-3 text-left">玩家</th>
                    <th className="px-4 py-3 text-right">胜</th>
                    <th className="px-4 py-3 text-right">负</th>
                    <th className="px-4 py-3 text-right">最高分</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-slate-700/50 ${
                        u.id === authUser?.id ? 'bg-orange-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-slate-500">{page * 20 + i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold">
                        {u.username}
                        {u.id === authUser?.id && (
                          <span className="text-orange-400 text-xs ml-1">(你)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-400">{u.wins}</td>
                      <td className="px-4 py-2.5 text-right text-red-400">{u.losses}</td>
                      <td className="px-4 py-2.5 text-right text-orange-400 font-mono">{u.bestScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded transition"
              >
                上一页
              </button>
              <span className="text-sm text-slate-500 py-1">第 {page + 1} 页</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={leaderboard.length < 20}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded transition"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, color = 'text-orange-400' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 text-center">
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
