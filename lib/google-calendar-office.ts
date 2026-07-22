import { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { ScheduleRecord } from "@/lib/types";
import {
  addDaysYmd,
  mondayOfWeekContaining,
  sevenDaysFromMonday,
  toSeoulDateYmd,
} from "@/lib/seoul-week";
import { getTodaySeoulYmd } from "@/lib/recording-cleanup";

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** Vercel 등에서 값을 따옴표로 감싸 넣은 경우 제거 */
function envTrim(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") return "";
  let t = v.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}

type GCalDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GCalEventItem = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GCalDateTime;
  end?: GCalDateTime;
};

/**
 * API 키는 **공개로 설정된 캘린더**만 읽을 수 있습니다(비공개 Gmail 기본 캘린더는 403).
 * 캘린더 설정 → 액세스 권한에서 "전체 일정 세부정보 공개" 등으로 공개 필요.
 */
function isApiKeyCalendarConfigured(): boolean {
  return Boolean(envTrim("GOOGLE_CALENDAR_ID") && envTrim("GOOGLE_CALENDAR_API_KEY"));
}

/** 캘린더 목록에서 `summary`와 정확히 일치하는 부캘만 사용 (예: MBC충북) */
function subcalendarSummaryFilter(): string | null {
  const s = envTrim("GOOGLE_CALENDAR_SUBCALENDAR_SUMMARY");
  return s || null;
}

function isOAuthCalendarConfigured(): boolean {
  if (
    !envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_ID") ||
    !envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET") ||
    !envTrim("GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN")
  ) {
    return false;
  }
  return Boolean(envTrim("GOOGLE_CALENDAR_ID") || subcalendarSummaryFilter());
}

function isServiceAccountCalendarConfigured(): boolean {
  return Boolean(
    envTrim("GOOGLE_CALENDAR_CLIENT_EMAIL") &&
      envTrim("GOOGLE_CALENDAR_PRIVATE_KEY") &&
      (envTrim("GOOGLE_CALENDAR_ID") || subcalendarSummaryFilter())
  );
}

function isGoogleCalendarConfigured(): boolean {
  if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === "false") return false;
  return (
    isApiKeyCalendarConfigured() ||
    isOAuthCalendarConfigured() ||
    isServiceAccountCalendarConfigured()
  );
}

async function getCalendarAccessToken(): Promise<string | null> {
  try {
    if (isOAuthCalendarConfigured()) {
      const clientId = envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_ID");
      const clientSecret = envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET");
      const refreshToken = envTrim("GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN");
      const oauth2 = new OAuth2Client(clientId, clientSecret);
      oauth2.setCredentials({ refresh_token: refreshToken });
      const tok = await oauth2.getAccessToken();
      return tok?.token ?? null;
    }

    if (isServiceAccountCalendarConfigured()) {
      const clientEmail = envTrim("GOOGLE_CALENDAR_CLIENT_EMAIL");
      const privateKey = normalizePrivateKey(
        envTrim("GOOGLE_CALENDAR_PRIVATE_KEY")
      );
      const auth = new GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: [CAL_SCOPE],
      });
      const client = await auth.getClient();
      const tok = await client.getAccessToken();
      return tok?.token ?? null;
    }
  } catch (e) {
    console.error("Google Calendar getAccessToken:", e);
    return null;
  }

  return null;
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

function safeGcalRecordId(parts: string): string {
  const b = Buffer.from(parts, "utf8").toString("base64url");
  return `gcal_${b}`;
}

/** 이번 주·다음 주(월~일 각각) 서울 달력 YYYY-MM-DD 집합 */
function thisAndNextWeekSeoulDays(): Set<string> {
  const todayYmd = getTodaySeoulYmd();
  const thisMon = mondayOfWeekContaining(todayYmd);
  const nextMon = addDaysYmd(thisMon, 7);
  const days = [
    ...sevenDaysFromMonday(thisMon),
    ...sevenDaysFromMonday(nextMon),
  ];
  return new Set(days);
}

function formatSeoulTimeRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const a = new Date(startIso);
  const b = new Date(endIso);
  const s = new Intl.DateTimeFormat("sv-SE", opts).format(a);
  const e = new Intl.DateTimeFormat("sv-SE", opts).format(b);
  if (s === e) return s;
  return `${s}–${e}`;
}

/** 올데이: start/end date (end 배타적). 서울 달력 날짜로 취급 */
function expandAllDayYmds(startYmd: string, endExclusiveYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  while (cur < endExclusiveYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function eventToRecordSlices(
  ev: GCalEventItem,
  allowed: Set<string>,
  recordMemo: string
): ScheduleRecord[] {
  const eid = ev.id?.trim();
  if (!eid) return [];

  const summary = (ev.summary?.trim() || "(제목 없음)") as string;
  const location = ev.location?.trim();
  const desc = ev.description?.trim();

  const start = ev.start;
  const end = ev.end;
  if (!start) return [];

  const records: ScheduleRecord[] = [];

  if (start.date) {
    const endEx = end?.date
      ? end.date
      : addDaysYmd(start.date, 1);
    const ymds = expandAllDayYmds(start.date, endEx).filter((d) =>
      allowed.has(d)
    );
    for (const ymd of ymds) {
      records.push({
        id: safeGcalRecordId(`${eid}:${ymd}:allday`),
        type: "office-schedule",
        uploadedAt: `${ymd}T12:00:00+09:00`,
        memo: recordMemo,
        summary,
        details: {
          title: summary,
          program: summary,
          period: `${ymd} · ${recordMemo}`,
          entries: [
            {
              date: ymd,
              place: location,
              note: desc || undefined,
            },
          ],
        },
      });
    }
    return records;
  }

  if (start.dateTime && end?.dateTime) {
    const ymd = toSeoulDateYmd(start.dateTime);
    if (!ymd || !allowed.has(ymd)) return [];
    const timeLabel = formatSeoulTimeRange(start.dateTime, end.dateTime);
    records.push({
      id: safeGcalRecordId(`${eid}:${ymd}:timed`),
      type: "office-schedule",
      uploadedAt: start.dateTime,
      memo: recordMemo,
      summary,
      details: {
        title: summary,
        program: summary,
        period: `${ymd} · ${recordMemo}`,
        entries: [
          {
            date: ymd,
            time: timeLabel,
            place: location,
            note: desc || undefined,
          },
        ],
      },
    });
    return records;
  }

  return records;
}

type CalendarAuth =
  | { kind: "bearer"; token: string }
  | { kind: "apiKey"; key: string };

async function fetchCalendarEventPages(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  auth: CalendarAuth
): Promise<GCalEventItem[]> {
  const items: GCalEventItem[] = [];
  let pageToken: string | undefined;

  do {
    const u = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`
    );
    u.searchParams.set("singleEvents", "true");
    u.searchParams.set("orderBy", "startTime");
    u.searchParams.set("timeMin", timeMin);
    u.searchParams.set("timeMax", timeMax);
    u.searchParams.set("maxResults", "250");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    if (auth.kind === "apiKey") {
      u.searchParams.set("key", auth.key);
    }

    const headers: Record<string, string> = {};
    if (auth.kind === "bearer") {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    const res = await fetch(u.toString(), {
      headers,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Google Calendar API ${res.status}: ${text.slice(0, 200)}`
      );
    }

    const data = (await res.json()) as {
      items?: GCalEventItem[];
      nextPageToken?: string;
    };
    if (Array.isArray(data.items)) items.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

type CalendarListItem = { id?: string; summary?: string };

async function fetchCalendarListAll(
  accessToken: string
): Promise<CalendarListItem[]> {
  const out: CalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    );
    u.searchParams.set("maxResults", "250");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Google Calendar calendarList ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const data = (await res.json()) as {
      items?: CalendarListItem[];
      nextPageToken?: string;
    };
    if (Array.isArray(data.items)) out.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function findCalendarIdBySummary(
  accessToken: string,
  wantedSummary: string
): Promise<string | null> {
  const wanted = wantedSummary.trim();
  const items = await fetchCalendarListAll(accessToken);
  const summariesSeen: string[] = [];
  for (const item of items) {
    const sum = item.summary?.trim();
    if (sum) summariesSeen.push(sum);
    if (sum === wanted && item.id) return item.id;
  }
  console.warn(
    `Google Calendar: "${wanted}" 이름의 캘린더를 찾지 못했습니다. 목록 요약 예: ${summariesSeen.slice(0, 25).join(", ")}`
  );
  return null;
}

/**
 * 기본(주) 캘린더에 쓰는 ID 형태(이메일)인지 추정.
 * 부캘은 보통 `...@group.calendar.google.com`.
 */
function looksLikePrimaryStyleCalendarId(calendarId: string): boolean {
  const s = calendarId.trim();
  if (s.includes("@group.calendar.google.com")) return false;
  return s.includes("@");
}

async function resolveTargetCalendarId(opts: {
  accessToken: string | null;
  explicitCalendarId: string | undefined;
  bySubcalendarSummary: string | null;
  authKind: "bearer" | "apiKey";
}): Promise<string | null> {
  const { accessToken, explicitCalendarId, bySubcalendarSummary, authKind } =
    opts;

  if (authKind === "bearer" && accessToken) {
    if (bySubcalendarSummary) {
      return findCalendarIdBySummary(accessToken, bySubcalendarSummary);
    }
    const id = explicitCalendarId?.trim();
    return id || null;
  }

  const id = explicitCalendarId?.trim();
  if (!id) return null;
  return id;
}

/**
 * 서버에서만 호출. 환경 변수가 없거나 실패하면 빈 배열.
 *
 * **인증:** OAuth/서비스 계정이 있으면 API 키보다 우선(부캘 이름 → calendarList로 ID 해석).
 * API 키만 있으면 `GOOGLE_CALENDAR_ID`에 읽을 캘린더 ID를 직접 넣어야 함.
 */
export async function fetchGoogleCalendarOfficeRecords(opts?: {
  startYmd?: string;
  endYmd?: string;
}): Promise<ScheduleRecord[]> {
  if (!isGoogleCalendarConfigured()) return [];

  const nameFilter = subcalendarSummaryFilter();
  const explicitId = envTrim("GOOGLE_CALENDAR_ID");
  const recordMemo = nameFilter
    ? `Google Calendar · ${nameFilter}`
    : "Google Calendar";

  // 날짜 범위: 파라미터가 있으면 사용, 없으면 이번 주 + 다음 주
  let startYmd: string;
  let endYmdExclusive: string;
  let allowed: Set<string>;

  if (opts?.startYmd && opts?.endYmd) {
    startYmd = opts.startYmd;
    endYmdExclusive = addDaysYmd(opts.endYmd, 1);
    // 요청 범위 내 모든 날짜를 허용
    const days: string[] = [];
    let cur = startYmd;
    while (cur <= opts.endYmd) {
      days.push(cur);
      cur = addDaysYmd(cur, 1);
    }
    allowed = new Set(days);
  } else {
    allowed = thisAndNextWeekSeoulDays();
    const todayYmd = getTodaySeoulYmd();
    const thisMon = mondayOfWeekContaining(todayYmd);
    const nextSun = addDaysYmd(thisMon, 13);
    startYmd = thisMon;
    endYmdExclusive = addDaysYmd(nextSun, 1);
  }

  const timeMin = `${startYmd}T00:00:00+09:00`;
  const timeMax = `${endYmdExclusive}T00:00:00+09:00`;

  try {
    const hasBearer =
      isOAuthCalendarConfigured() || isServiceAccountCalendarConfigured();
    const hasApiKey = isApiKeyCalendarConfigured();

    if (!hasBearer && !hasApiKey) return [];

    if (
      !hasBearer &&
      hasApiKey &&
      nameFilter &&
      explicitId &&
      looksLikePrimaryStyleCalendarId(explicitId)
    ) {
      console.error(
        `Google Calendar: "${nameFilter}" 부캘만 쓰려면 (1) OAuth 리프레시 토큰을 설정하거나, (2) Google 캘린더 → 해당 캘린더 설정 → 통합 캘린더의 캘린더 ID를 GOOGLE_CALENDAR_ID에 넣으세요. 지금은 기본 캘린더(이메일) ID라 부캘 일정을 가져올 수 없습니다.`
      );
      return [];
    }

    let calendarAuth: CalendarAuth;
    let accessToken: string | null = null;

    if (hasBearer) {
      const token = await getCalendarAccessToken();
      if (!token) {
        console.warn("Google Calendar: 액세스 토큰을 받지 못했습니다.");
        return [];
      }
      accessToken = token;
      calendarAuth = { kind: "bearer", token };
    } else {
      calendarAuth = {
        kind: "apiKey",
        key: envTrim("GOOGLE_CALENDAR_API_KEY"),
      };
    }

    const calendarId = await resolveTargetCalendarId({
      accessToken,
      explicitCalendarId: explicitId,
      bySubcalendarSummary: nameFilter,
      authKind: hasBearer ? "bearer" : "apiKey",
    });

    if (!calendarId) return [];

    const raw = await fetchCalendarEventPages(
      calendarId,
      timeMin,
      timeMax,
      calendarAuth
    );

    const out: ScheduleRecord[] = [];
    for (const ev of raw) {
      out.push(...eventToRecordSlices(ev, allowed, recordMemo));
    }
    return out;
  } catch (e) {
    console.error("Google Calendar 동기화 실패:", e);
    return [];
  }
}

export type GoogleCalendarHealthSnapshot = {
  syncDisabled: boolean;
  integrationConfigured: boolean;
  authMode: "oauth" | "service_account" | "api_key" | "none";
  subcalendarSummary: string | null;
  calendarIdConfigured: boolean;
  tokenRefresh: "ok" | "fail" | "skipped";
  tokenError?: string;
  hint?: string;
};

/** 배포 진단용 — 비밀값은 노출하지 않음 */
export async function getGoogleCalendarHealthSnapshot(): Promise<GoogleCalendarHealthSnapshot> {
  const syncDisabled = process.env.GOOGLE_CALENDAR_SYNC_ENABLED === "false";
  const sub = subcalendarSummaryFilter();
  const calId = envTrim("GOOGLE_CALENDAR_ID");
  const integrationConfigured = isGoogleCalendarConfigured();

  const oauth = isOAuthCalendarConfigured();
  const sa = isServiceAccountCalendarConfigured();
  const api = isApiKeyCalendarConfigured();

  let authMode: GoogleCalendarHealthSnapshot["authMode"] = "none";
  if (oauth) authMode = "oauth";
  else if (sa) authMode = "service_account";
  else if (api) authMode = "api_key";

  let tokenRefresh: GoogleCalendarHealthSnapshot["tokenRefresh"] = "skipped";
  let tokenError: string | undefined;

  if (!syncDisabled && oauth) {
    try {
      const clientId = envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_ID");
      const clientSecret = envTrim("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET");
      const refreshToken = envTrim("GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN");
      const oauth2 = new OAuth2Client(clientId, clientSecret);
      oauth2.setCredentials({ refresh_token: refreshToken });
      const tok = await oauth2.getAccessToken();
      if (tok?.token) tokenRefresh = "ok";
      else {
        tokenRefresh = "fail";
        tokenError = "getAccessToken 결과가 비었습니다.";
      }
    } catch (e) {
      tokenRefresh = "fail";
      tokenError =
        e instanceof Error ? e.message.slice(0, 280) : String(e).slice(0, 280);
    }
  }

  let hint: string | undefined;
  if (syncDisabled) {
    hint = "GOOGLE_CALENDAR_SYNC_ENABLED=false 이면 연동이 꺼져 있습니다.";
  } else if (!integrationConfigured) {
    hint = "Google Calendar 환경 변수가 없습니다.";
  } else if (
    !oauth &&
    !sa &&
    api &&
    sub &&
    calId &&
    looksLikePrimaryStyleCalendarId(calId)
  ) {
    hint =
      "OAuth(리프레시 토큰)이 없어 API 키만 사용 중입니다. 부캘 이름만으로는 기본 캘린더 ID로 조회할 수 없습니다. Vercel에 GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN·CLIENT_ID·CLIENT_SECRET을 Production에 넣거나, GOOGLE_CALENDAR_ID를 부캘의 캘린더 ID로 바꾸세요.";
  } else if (oauth && tokenRefresh === "fail") {
    hint =
      "OAuth 토큰 갱신 실패 — 값에 따옴표가 들어갔는지, Production 환경에 동일 변수가 있는지 확인하세요.";
  }

  return {
    syncDisabled,
    integrationConfigured,
    authMode,
    subcalendarSummary: sub,
    calendarIdConfigured: Boolean(calId),
    tokenRefresh,
    tokenError,
    hint,
  };
}
