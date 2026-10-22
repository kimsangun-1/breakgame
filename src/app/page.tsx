"use client";

import { useState } from "react";
import Image from "next/image";
import GameBoard from "@/components/GameBoard";
import RankingBoard from "@/components/RankingBoard";

export default function Home() {
  const [userName, setUserName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [imageError, setImageError] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const handleStartGame = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userName.trim();
    if (!trimmed) {
      setErrorMessage("게임을 시작하려면 사용자 이름을 입력해 주세요!");
      return;
    }

    setErrorMessage("");
    setGameStarted(true);
  };

  const handleRestartToHome = () => {
    setUserName(""); // Reset user name input field
    setErrorMessage("");
    setGameStarted(false);
  };

  const handleExitToHome = () => {
    setGameStarted(false); // Retain user name or exit directly
  };

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-sky-950 via-indigo-950 to-slate-950 text-white flex flex-col justify-between items-center p-3 sm:p-6 relative overflow-hidden select-none">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-400/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content: First screen vs Game screen */}
      {!gameStarted ? (
        <>
          {/* Header section */}
          <header className="w-full text-center pt-4 sm:pt-6 z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs sm:text-sm font-medium tracking-wide mb-3 backdrop-blur-sm shadow-inner">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              INCHEON NATIONAL UNIVERSITY
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-300 via-cyan-200 to-indigo-200 bg-clip-text text-transparent drop-shadow-md">
              INU 벽돌깨기
            </h1>
            <p className="text-slate-300/80 text-xs sm:text-sm mt-1 sm:mt-2">
              마스코트 횃불이와 함께하는 신나는 블록 브레이커
            </p>
          </header>

          {/* Interactive Card */}
          <section className="w-full max-w-sm sm:max-w-md mx-auto my-auto z-10">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/60 flex flex-col items-center text-center transition-all">
              {/* Mascot Image */}
              <div className="relative mb-6 group">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 opacity-60 blur-md group-hover:opacity-90 transition duration-300" />
                <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden border-2 border-white/20 bg-slate-800 flex items-center justify-center shadow-lg">
                  {!imageError ? (
                    <Image
                      src="/Mascot.jpg"
                      alt="인천대학교 마스코트 횃불이"
                      fill
                      sizes="(max-width: 640px) 144px, 176px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      priority
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-slate-300">
                      <span className="text-4xl mb-1">🔥</span>
                      <span className="text-xs font-semibold text-cyan-300">
                        횃불이 마스코트
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Input & Form */}
              <form onSubmit={handleStartGame} className="w-full flex flex-col gap-3">
                <div className="text-left">
                  <label
                    htmlFor="userName"
                    className="block text-xs font-semibold text-slate-300 mb-1.5 ml-1"
                  >
                    플레이어 이름
                  </label>
                  <input
                    id="userName"
                    type="text"
                    maxLength={12}
                    placeholder="이름을 입력하세요 (예: 횃불이)"
                    value={userName}
                    onChange={(e) => {
                      setUserName(e.target.value);
                      if (errorMessage) setErrorMessage("");
                    }}
                    className={`w-full px-4 py-3 rounded-xl bg-slate-800/90 border text-white placeholder-slate-400 text-sm focus:outline-none transition-all shadow-inner ${
                      errorMessage
                        ? "border-rose-500 ring-2 ring-rose-500/30"
                        : "border-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                    }`}
                  />
                  {errorMessage && (
                    <p className="text-xs text-rose-400 mt-1.5 ml-1 flex items-center gap-1 font-medium animate-fadeIn">
                      ⚠️ {errorMessage}
                    </p>
                  )}
                </div>

                {/* Start Button */}
                <button
                  type="submit"
                  className="mt-2 w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-500 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-blue-600/30 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🎮 게임 시작</span>
                </button>
              </form>
            </div>

            {/* Top 3 Ranking Board on Home Screen */}
            <div className="mt-4">
              <RankingBoard />
            </div>
          </section>
        </>
      ) : (
        /* Game Screen */
        <section className="w-full flex-1 flex flex-col items-center justify-center z-10 py-2">
          <GameBoard
            userName={userName}
            onRestart={handleRestartToHome}
            onExit={handleExitToHome}
          />
        </section>
      )}

      {/* Footer Creator Information */}
      <footer className="w-full text-center py-3 z-10 border-t border-slate-800/80 mt-4">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-400">
          <span className="font-medium text-slate-300">제작자:</span>
          <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-medium">
            경영학부
          </span>
          <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-mono">
            202301689
          </span>
          <span className="px-2.5 py-0.5 rounded-md bg-blue-900/50 border border-blue-500/40 text-blue-200 font-semibold">
            김민서
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          © INCHEON NATIONAL UNIVERSITY. All Rights Reserved.
        </p>
      </footer>
    </main>
  );
}
