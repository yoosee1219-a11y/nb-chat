/**
 * 도메인 상수 매핑 (Vijob 청크에서 추출한 라벨 그대로)
 */

export const NATIONALITY: Record<string, { label: string; flag: string }> = {
  KR: { label: "대한민국", flag: "🇰🇷" },
  VN: { label: "베트남", flag: "🇻🇳" },
  NP: { label: "네팔", flag: "🇳🇵" },
  CN: { label: "중국", flag: "🇨🇳" },
  TW: { label: "대만", flag: "🇹🇼" },
  TL: { label: "동티모르", flag: "🇹🇱" },
  LA: { label: "라오스", flag: "🇱🇦" },
  RU: { label: "러시아", flag: "🇷🇺" },
  MN: { label: "몽골", flag: "🇲🇳" },
  MM: { label: "미얀마", flag: "🇲🇲" },
  US: { label: "미국", flag: "🇺🇸" },
  BD: { label: "방글라데시", flag: "🇧🇩" },
  ETC: { label: "기타", flag: "🌐" },
};

export const LANGUAGE: Record<string, { label: string; bcp47: string }> = {
  KO_KR: { label: "한국어", bcp47: "ko" },
  VI_VN: { label: "베트남어", bcp47: "vi" },
  NE_NP: { label: "네팔어", bcp47: "ne" },
  ZH_CN: { label: "중국어 간체", bcp47: "zh-CN" },
  ZH_TW: { label: "중국어 번체", bcp47: "zh-TW" },
  PT_TL: { label: "포르투갈어", bcp47: "pt" },
  LO_LA: { label: "라오어", bcp47: "lo" },
  RU_RU: { label: "러시아어", bcp47: "ru" },
  MN_MN: { label: "몽골어", bcp47: "mn" },
  MY_MM: { label: "미얀마어", bcp47: "my" },
  EN_US: { label: "영어", bcp47: "en" },
  BN_BD: { label: "벵골어", bcp47: "bn" },
};

export const CONSULTATION_STATUS = {
  PENDING: { label: "대기중", className: "bg-gray-100 text-gray-700 border-gray-200" },
  IN_PROGRESS: { label: "상담 중", className: "bg-amber-100 text-amber-700 border-amber-200" },
  CONFIRMED: { label: "확정", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "취소", className: "bg-red-100 text-red-700 border-red-200" },
  UNCONFIRMED: { label: "미확정", className: "bg-sky-100 text-sky-700 border-sky-200" },
} as const;

export type ConsultationStatus = keyof typeof CONSULTATION_STATUS;

export const VISA_TYPES = [
  "E-9", "E-7", "E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-8", "E-10",
  "F-2", "F-4", "F-5", "F-6",
  "D-2", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9", "D-10",
  "H-2", "C-3", "C-4",
];

export const CARRIER = ["LGU+", "KT", "SKT"] as const;
export type Carrier = (typeof CARRIER)[number];

export const MANAGER_ROLE = {
  ADMIN: { label: "관리자", className: "bg-purple-100 text-purple-700 border-purple-200" },
  MANAGER: { label: "매니저", className: "bg-blue-100 text-blue-700 border-blue-200" },
  VIEWER: { label: "조회자", className: "bg-gray-100 text-gray-700 border-gray-200" },
} as const;

export const AUDIT_ACTIONS = {
  LOGIN: "로그인",
  LOGOUT: "로그아웃",
  APPLICANT_VIEWED: "신청자 조회",
  APPLICANT_STATUS_CHANGED: "신청자 상태 변경",
  NOTE_CREATED: "메모 작성",
  NOTE_UPDATED: "메모 수정",
  NOTE_DELETED: "메모 삭제",
  PLAN_CREATED: "요금제 등록",
  PLAN_UPDATED: "요금제 수정",
  PLAN_DELETED: "요금제 삭제",
  MANAGER_CREATED: "매니저 추가",
  MANAGER_UPDATED: "매니저 수정",
  MANAGER_DEACTIVATED: "매니저 비활성화",
  MESSAGE_SENT: "메시지 전송",
  PARTNER_CREATED: "거래처 등록",
  PARTNER_UPDATED: "거래처 수정",
  PARTNER_DELETED: "거래처 삭제",
  FLOW_CREATED: "챗봇 플로우 생성",
  FLOW_SAVED: "챗봇 플로우 저장",
  FLOW_DELETED: "챗봇 플로우 삭제",
} as const;
