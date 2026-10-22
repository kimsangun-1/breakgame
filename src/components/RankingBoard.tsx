"use client";

import React, { useEffect, useState, useCallback } from "react";
import { fetchTop3Ranking, calculateRankings, Top3Record } from "@/utils/ranking";

interface RankingBoardProps {
  refreshTrigger?: number; // Increment to trigger reload
}

export default function RankingBoard({ refreshTrigger }: RankingBoardProps) {
  const [records, setRecords] = useState<Array<Top3Record & { rank: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRanking = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const res = await fetchTop3Ranking();

    if (!res.success) {
      setErrorMessage(res.error || "기록을 불러오는 중 오류가 발생했습니다.");
      setRecords([]);
    } else {
      // Sort elapsed_seconds ascending and get top 3
      const sorted = [...res.data]
        .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds)
        .slice(0, 3);
      setRecords(calculateRankings(sorted));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRanking();
  }, [loadRanking, refreshTrigger]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { badge: "🥇 1위", color: "text-amber-300 bg-amber-400/10 border-amber-400/30" };
    if (rank === 2) return { badge: "🥈 2위", color: "text-slate-200 bg-slate-300/10 border-slate-300/30" };
    if (rank === 3) return { badge: "🥉 3위", color: "text-amber-600 bg-amber-700/10 border-amber-700/30" };
    return { badge: `${rank}위`, color: "text-slate-300 bg-slate-800 border-slate-700" };
  };

  return (
    <div className="w-full bg-slate-900/85 backdrop-blur-md border border-slate-700/70 rounded-2xl p-4 sm:p-5 shadow-xl text-slate-100 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏆</span>
          <h3 className="font-bold text-sm sm:text-base text-cyan-300 tracking-wide">
            실시간 명예의 전당 (Top 3)
          </h3>
        </div>
        <button
          onClick={loadRanking}
          disabled={isLoading}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
        >
          <span>{isLoading ? "⌛ 불러오는 중..." : "🔄 새로고침"}</span>
        </button>
      </div>

      {/* Content State Handling */}
      {isLoading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>순위 정보를 불러오는 중입니다...</span>
        </div>
      ) : errorMessage ? (
        <div className="py-4 px-3 bg-rose-950/30 border border-rose-800/50 rounded-xl text-center">
          <p className="text-xs text-rose-300 font-medium">⚠️ {errorMessage}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Google 시트 배포 설정을 확인하거나 잠시 후 다시 시도해 주세요.
          </p>
        </div>
      ) : records.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-xs sm:text-sm">
          <p className="text-2xl mb-1">🎯</p>
          <p className="font-medium text-slate-300">아직 등록된 기록이 없습니다</p>
          <p className="text-[11px] text-slate-500 mt-1">첫 번째 미션 성공자가 되어보세요!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((item, idx) => {
            const { badge, color } = getRankBadge(item.rank);
            return (
              <div
                key={`${item.player}-${item.elapsed_seconds}-${idx}`}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
              >
                {/* Rank & Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${color} shrink-0`}>
                    {badge}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                    {item.player}
                  </span>
                </div>

                {/* Time */}
                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <span className="text-[11px] text-slate-400">완료 시간:</span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                    {item.clear_time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
