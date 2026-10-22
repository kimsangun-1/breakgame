export interface Top3Record {
  timestamp: string;
  player: string;
  elapsed_seconds: number;
  clear_time: string;
  result: string;
}

export interface RankingResponse {
  success: boolean;
  data: Top3Record[];
  error?: string;
}

export const GOOGLE_SCRIPT_URL =
  process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbwiG_X5oOmbipQqVZTCRoX_RoVkK_wGE578itDdRndiBL10fQ-vXg2n4Fs4GJStKPo4vA/exec";

/**
 * Top 3 ranking fetch with robust fallback and error handling
 */
export async function fetchTop3Ranking(): Promise<RankingResponse> {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=top3`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        success: false,
        data: [],
        error: `서버 응답 오류 (HTTP ${res.status})`,
      };
    }

    const text = await res.text();
    // Verify if it's HTML permission page or JSON
    if (text.trim().startsWith("<") || text.includes("액세스 권한 필요")) {
      return {
        success: false,
        data: [],
        error: "Google 웹 앱 배포 권한이 '모든 사용자(Anyone)'로 설정되어 있지 않습니다.",
      };
    }

    const json = JSON.parse(text);
    if (json.status === "success" && Array.isArray(json.data)) {
      // Normalize clear_time to clean mm:ss (prevent Google Sheet Date object stringification)
      const cleanData: Top3Record[] = json.data.map((item: Top3Record) => {
        let cleanTime = String(item.clear_time || "");
        if (cleanTime.includes("GMT") || cleanTime.includes("1899")) {
          // If Sheet treated it as Time/Date, convert elapsed_seconds back to mm:ss
          const sec = Math.floor(Number(item.elapsed_seconds) || 0);
          const m = String(Math.floor(sec / 60)).padStart(2, "0");
          const s = String(sec % 60).padStart(2, "0");
          cleanTime = `${m}:${s}`;
        }
        return {
          ...item,
          clear_time: cleanTime,
        };
      });

      return {
        success: true,
        data: cleanData,
      };
    }

    return {
      success: true,
      data: [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[Ranking] Failed to fetch top 3:", msg);
    return {
      success: false,
      data: [],
      error: "네트워크 연결 실패 또는 서버 응답 불가",
    };
  }
}

/**
 * Save mission success record to Google Sheets
 */
export async function saveGameSuccessRecord(
  player: string,
  elapsedMs: number,
  clearTimeFormatted: string
): Promise<{ status: string; message?: string }> {
  try {
    const elapsedSeconds = Number((elapsedMs / 1000).toFixed(2));
    const payload = {
      player,
      elapsed_seconds: elapsedSeconds,
      clear_time: clearTimeFormatted,
      result: "SUCCESS",
    };

    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
    });

    if (!res.ok) {
      return { status: "error", message: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[Ranking] Failed to save record:", msg);
    return { status: "error", message: msg };
  }
}

/**
 * Helper to compute standard dense/competition ranks for tied elapsed_seconds
 * (e.g. 1st, 2nd, 2nd or 1st, 2nd, 3rd)
 */
export function calculateRankings(records: Top3Record[]): Array<Top3Record & { rank: number }> {
  let currentRank = 1;
  return records.map((record, index) => {
    if (index > 0) {
      const prev = records[index - 1];
      if (Math.abs(prev.elapsed_seconds - record.elapsed_seconds) < 0.01) {
        // Tied record gets same rank
        return { ...record, rank: currentRank };
      }
      currentRank = index + 1;
    }
    return { ...record, rank: currentRank };
  });
}
