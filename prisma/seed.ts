/**
 * 시드 스크립트
 * 실행: npx tsx prisma/seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
let adapter;
if (url.startsWith("libsql:") || url.startsWith("https:")) {
  let cleanUrl = url;
  let authToken = process.env.DATABASE_AUTH_TOKEN;
  try {
    const u = new URL(url);
    const tokenFromQuery = u.searchParams.get("authToken");
    if (tokenFromQuery) {
      authToken = tokenFromQuery;
      u.searchParams.delete("authToken");
      cleanUrl = u.toString();
    }
  } catch {}
  adapter = new PrismaLibSql({ url: cleanUrl, authToken });
} else {
  adapter = new PrismaBetterSqlite3({ url });
}
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 시드 시작...");

  // ========================================
  // 매니저 (관리자 + 일반 매니저 2명)
  // ========================================
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const managerPasswordHash = await bcrypt.hash("manager123", 10);

  const admin = await prisma.manager.upsert({
    where: { email: "admin@fics.local" },
    update: {},
    create: {
      email: "admin@fics.local",
      name: "관리자",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  const m1 = await prisma.manager.upsert({
    where: { email: "manager1@fics.local" },
    update: {},
    create: {
      email: "manager1@fics.local",
      name: "김매니저",
      passwordHash: managerPasswordHash,
      role: "MANAGER",
    },
  });

  await prisma.manager.upsert({
    where: { email: "manager2@fics.local" },
    update: {},
    create: {
      email: "manager2@fics.local",
      name: "이매니저",
      passwordHash: managerPasswordHash,
      role: "MANAGER",
    },
  });

  console.log("  ✓ 매니저 3명 생성");

  // ========================================
  // 요금제 (LGU+ 4종)
  // ========================================
  const planSeeds = [
    {
      name: "5G 라이트",
      carrier: "LGU+",
      monthlyFee: 33000,
      dataAllowance: "6GB",
      voiceMinutes: "기본 제공",
      smsCount: "기본 제공",
      commitment: "12개월",
      description: "외국인 입문자용 가성비 요금제",
    },
    {
      name: "5G 스탠다드",
      carrier: "LGU+",
      monthlyFee: 55000,
      dataAllowance: "30GB",
      voiceMinutes: "무제한",
      smsCount: "무제한",
      commitment: "24개월",
      description: "일상 사용에 적합",
    },
    {
      name: "5G 프리미엄",
      carrier: "LGU+",
      monthlyFee: 85000,
      dataAllowance: "무제한",
      voiceMinutes: "무제한",
      smsCount: "무제한",
      commitment: "24개월",
      description: "고용량 데이터 사용자용",
    },
    {
      name: "유심 요금제 베이직",
      carrier: "LGU+",
      monthlyFee: 22000,
      dataAllowance: "3GB",
      voiceMinutes: "100분",
      smsCount: "100건",
      commitment: "약정 없음",
      description: "단기 체류용 (선불)",
    },
  ];

  const plans = [];
  for (const p of planSeeds) {
    const created = await prisma.plan.upsert({
      where: { id: `seed-plan-${p.name}` },
      update: { commitment: p.commitment }, // 기존 데이터에도 약정 채움
      create: { id: `seed-plan-${p.name}`, ...p },
    });
    plans.push(created);
  }
  console.log(`  ✓ 요금제 ${plans.length}개 생성`);

  // ========================================
  // 신청자 (다국적, 다양한 상태)
  // ========================================
  const applicantSeeds = [
    {
      name: "Ivan Petrov",
      nationality: "RU",
      preferredLanguage: "RU_RU",
      email: "ivan@example.com",
      phone: "010-1234-5678",
      visa: "F-4",
      status: "PENDING",
      appliedPlanId: plans[1].id, // 5G 스탠다드
    },
    {
      name: "Nguyen Van A",
      nationality: "VN",
      preferredLanguage: "VI_VN",
      email: "nguyen@example.com",
      phone: "010-9876-5432",
      visa: "E-9",
      status: "IN_PROGRESS",
      appliedPlanId: plans[0].id, // 5G 라이트
    },
    {
      name: "Battulga Erdene",
      nationality: "MN",
      preferredLanguage: "MN_MN",
      phone: "010-5555-1234",
      visa: "D-2",
      status: "PENDING",
      appliedPlanId: plans[2].id,
    },
    {
      name: "Aung Min",
      nationality: "MM",
      preferredLanguage: "MY_MM",
      email: "aung@example.com",
      phone: "010-7777-8888",
      visa: "E-9",
      status: "CONFIRMED",
      appliedPlanId: plans[1].id,
    },
    {
      name: "Bipin Sharma",
      nationality: "NP",
      preferredLanguage: "NE_NP",
      phone: "010-3333-4444",
      visa: "E-9",
      status: "UNCONFIRMED",
      appliedPlanId: plans[0].id,
    },
  ];

  const seededApplicants: Array<{ id: string; lang: string; status: string }> =
    [];
  for (const a of applicantSeeds) {
    const applicant = await prisma.applicant.upsert({
      where: { id: `seed-${a.name.replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `seed-${a.name.replace(/\s+/g, "-")}`,
        ...a,
        privacyConsent: true,
        thirdPartyConsent: true,
      },
    });

    // 채팅방 생성 (각 신청자별)
    await prisma.chatRoom.upsert({
      where: { id: `seed-room-${applicant.id}` },
      update: {},
      create: {
        id: `seed-room-${applicant.id}`,
        applicantId: applicant.id,
        managerId: a.status === "PENDING" ? null : m1.id,
        unreadCount: a.status === "PENDING" ? 1 : 0,
      },
    });

    seededApplicants.push({
      id: applicant.id,
      lang: a.preferredLanguage,
      status: a.status,
    });
  }
  console.log(`  ✓ 신청자 ${applicantSeeds.length}명 + 채팅방 생성`);

  // ========================================
  // 메시지 시드 — 자동번역 패턴 시연용
  // (originalText + language + translatedText 3-필드 패턴 모두 채움)
  // 매니저 메시지: lang=KO_KR, originalText=한국어, translatedText=신청자 언어
  // 신청자 메시지: lang=신청자언어, originalText=원어, translatedText=한국어
  // ========================================
  type Msg = {
    sender: "APPLICANT" | "MANAGER" | "SYSTEM";
    type: string;
    original?: string;
    translated?: string;
    lang?: string; // 메시지의 originalText 언어
    minutesAgo: number;
  };

  const conversations: Record<string, Msg[]> = {
    // Ivan (RU, PENDING) — 첫 인사만, 매니저 미응답
    "seed-Ivan-Petrov": [
      {
        sender: "SYSTEM",
        type: "SYSTEM",
        original: "신청자가 채팅방에 참여했습니다.",
        lang: "KO_KR",
        minutesAgo: 35,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "Здравствуйте! Я хочу подключить тариф.",
        translated: "안녕하세요! 요금제 가입하고 싶어요.",
        lang: "RU_RU",
        minutesAgo: 30,
      },
    ],

    // Nguyen (VN, IN_PROGRESS) — 양방향 활발한 대화
    "seed-Nguyen-Van-A": [
      {
        sender: "SYSTEM",
        type: "SYSTEM",
        original: "신청자가 채팅방에 참여했습니다.",
        lang: "KO_KR",
        minutesAgo: 180,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "Xin chào, tôi cần đăng ký SIM mới.",
        translated: "안녕하세요, 새 유심 등록이 필요합니다.",
        lang: "VI_VN",
        minutesAgo: 175,
      },
      {
        sender: "MANAGER",
        type: "TEXT",
        original: "안녕하세요. 비자 종류를 알려주실 수 있나요?",
        translated: "Xin chào. Anh có thể cho biết loại visa không?",
        lang: "KO_KR",
        minutesAgo: 170,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "Tôi có visa E-9.",
        translated: "저는 E-9 비자가 있어요.",
        lang: "VI_VN",
        minutesAgo: 160,
      },
      {
        sender: "MANAGER",
        type: "TEXT",
        original:
          "5G 라이트 요금제(33,000원/월) 가입 도와드리겠습니다. 외국인 등록증 사진 보내주세요.",
        translated:
          "Tôi sẽ giúp anh đăng ký gói 5G Lite (33.000 KRW/tháng). Vui lòng gửi ảnh thẻ đăng ký người nước ngoài.",
        lang: "KO_KR",
        minutesAgo: 90,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "Vâng, tôi sẽ gửi ngay.",
        translated: "네, 지금 바로 보낼게요.",
        lang: "VI_VN",
        minutesAgo: 60,
      },
    ],

    // Battulga (MN, PENDING) — 미응답 1건
    "seed-Battulga-Erdene": [
      {
        sender: "SYSTEM",
        type: "SYSTEM",
        original: "신청자가 채팅방에 참여했습니다.",
        lang: "KO_KR",
        minutesAgo: 12,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "Сайн байна уу, тариф сонгоход тусална уу.",
        translated: "안녕하세요, 요금제 선택 도와주세요.",
        lang: "MN_MN",
        minutesAgo: 10,
      },
    ],

    // Aung Min (MM, CONFIRMED) — 가입 확정 흐름
    "seed-Aung-Min": [
      {
        sender: "SYSTEM",
        type: "SYSTEM",
        original: "신청자가 채팅방에 참여했습니다.",
        lang: "KO_KR",
        minutesAgo: 1440,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "မင်္ဂလာပါ၊ ဖုန်းအသစ်ဝယ်ချင်ပါတယ်။",
        translated: "안녕하세요, 새 휴대폰 가입하고 싶어요.",
        lang: "MY_MM",
        minutesAgo: 1435,
      },
      {
        sender: "MANAGER",
        type: "TEXT",
        original: "5G 스탠다드 요금제 추천드립니다. 진행해드릴까요?",
        translated:
          "ကျွန်တော် 5G Standard ပလန်ကို အကြံပြုပါတယ်။ ဆက်လုပ်ပေးရမလား?",
        lang: "KO_KR",
        minutesAgo: 1400,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "ဟုတ်ကဲ့ ကျေးဇူးပါ။",
        translated: "네 감사합니다.",
        lang: "MY_MM",
        minutesAgo: 1390,
      },
      {
        sender: "MANAGER",
        type: "TEXT",
        original: "가입 완료되었습니다. 유심은 내일 발송됩니다.",
        translated:
          "မှတ်ပုံတင်ပြီးပါပြီ။ SIM ကို မနက်ဖြန်ပို့ပေးပါမယ်။",
        lang: "KO_KR",
        minutesAgo: 60,
      },
    ],

    // Bipin (NP, UNCONFIRMED) — 매니저 응답 후 신청자 무응답
    "seed-Bipin-Sharma": [
      {
        sender: "SYSTEM",
        type: "SYSTEM",
        original: "신청자가 채팅방에 참여했습니다.",
        lang: "KO_KR",
        minutesAgo: 4320,
      },
      {
        sender: "APPLICANT",
        type: "TEXT",
        original: "नमस्ते, सिम कार्ड चाहिए।",
        translated: "안녕하세요, 유심 카드 필요해요.",
        lang: "NE_NP",
        minutesAgo: 4300,
      },
      {
        sender: "MANAGER",
        type: "TEXT",
        original: "외국인 등록증 사본 부탁드립니다.",
        translated: "कृपया विदेशी दर्ता प्रमाणपत्रको प्रति पठाउनुहोस्।",
        lang: "KO_KR",
        minutesAgo: 4200,
      },
    ],
  };

  // 기존 메시지 정리 (멱등성을 위해)
  const seedRoomIds = seededApplicants.map((a) => `seed-room-${a.id}`);
  await prisma.message.deleteMany({
    where: { roomId: { in: seedRoomIds } },
  });

  let totalMsgs = 0;
  for (const sa of seededApplicants) {
    const roomId = `seed-room-${sa.id}`;
    const msgs = conversations[sa.id] ?? [];
    let lastAt: Date | null = null;

    for (const m of msgs) {
      const createdAt = new Date(Date.now() - m.minutesAgo * 60_000);
      lastAt = createdAt;

      await prisma.message.create({
        data: {
          roomId,
          senderType: m.sender,
          senderId:
            m.sender === "APPLICANT"
              ? sa.id
              : m.sender === "MANAGER"
              ? m1.id
              : null,
          type: m.type,
          originalText: m.original ?? null,
          language: m.lang ?? null,
          translatedText: m.translated ?? null,
          isRead: m.sender !== "APPLICANT" || sa.status !== "PENDING",
        },
      });
      totalMsgs++;
    }

    if (lastAt) {
      // 마지막 메시지 시각 + 미읽음 카운트 동기화
      const unread = msgs.filter(
        (m) => m.sender === "APPLICANT" && sa.status === "PENDING"
      ).length;
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: {
          lastMessageAt: lastAt,
          unreadCount: unread,
        },
      });
    }
  }
  console.log(`  ✓ 메시지 ${totalMsgs}건 생성 (자동번역 패턴 포함)`);

  // ========================================
  // 거래처 (Partner) — Phase 5.1
  // DIRECT는 시스템 reserved — 자체광고 유입을 묶는 용도
  // 샘플 거래처 2개도 함께 (스텔업, 워크온)
  // ========================================
  console.log("\n🏢 거래처...");

  await prisma.partner.upsert({
    where: { code: "DIRECT" },
    update: {},
    create: {
      code: "DIRECT",
      name: "자체광고",
      memo: "본인 회사가 직접 집행하는 광고/캠페인. UTM 파라미터로 캠페인별 분리.",
      isActive: true,
    },
  });

  await prisma.partner.upsert({
    where: { code: "stealup" },
    update: {},
    create: {
      code: "stealup",
      name: "스텔업",
      contact: "스텔업 제휴팀 / partners@stealup.example",
      memo: "교육 플랫폼 시청 고객 대상 리타겟팅 배너",
      isActive: true,
    },
  });

  await prisma.partner.upsert({
    where: { code: "workon" },
    update: {},
    create: {
      code: "workon",
      name: "워크온",
      contact: "워크온 운영팀 / biz@workon.example",
      memo: "워크온 사이트 내 배너 노출",
      isActive: true,
    },
  });

  console.log("  ✓ DIRECT(자체광고) + 샘플 거래처 2개 (스텔업, 워크온)");

  // ========================================
  // 챗봇 플로우 (PUBLISHED) — Phase 4.4 데모용
  //
  // 흐름:
  //   start (always)
  //     → message (인사) — KO 한국어, 신청자 언어로 자동 번역
  //     → condition (status == PENDING)
  //         true  → llm (Claude/GPT 응답) → 끝
  //         false → escalate (이미 상담 중인 신청자는 매니저로)
  // ========================================
  console.log("\n🤖 챗봇 플로우...");

  const flowNodes = [
    {
      id: "start",
      type: "start",
      position: { x: 250, y: 60 },
      data: {
        kind: "start",
        label: "시작",
        trigger: "always",
        triggerValue: "",
      },
      deletable: false,
    },
    {
      id: "msg-greet",
      type: "message",
      position: { x: 250, y: 200 },
      data: {
        kind: "message",
        label: "인사",
        text: "안녕하세요 {{applicant.name}}님! NB Chat 외국인 가입 상담입니다. 잠시만 기다려주세요.",
        language: "KO_KR",
      },
    },
    {
      id: "cond-status",
      type: "condition",
      position: { x: 250, y: 340 },
      data: {
        kind: "condition",
        label: "신규 신청자?",
        field: "status",
        operator: "equals",
        value: "PENDING",
      },
    },
    {
      id: "llm-reply",
      type: "llm",
      position: { x: 60, y: 500 },
      data: {
        kind: "llm",
        label: "AI 응답",
        model: "claude-haiku-4-5",
        systemPrompt: [
          "당신은 한국 통신사 LGU+의 외국인 신규 가입 상담 챗봇입니다.",
          "역할: 신청자가 가입에 필요한 서류와 절차를 이해하도록 안내.",
          "",
          "필수 안내 정보 (사용자가 묻거나 관련될 때):",
          "- 가입에 필요한 서류: 여권 + 외국인등록증 (또는 거소증) + 비자 (E-9/F-2/F-4/D-2/D-4/H-2 등)",
          "- 미성년자(만 19세 미만)는 부모 동행 또는 위임장 필요",
          "- 결제: 한국 은행 계좌 (외국인 계좌 OK) 또는 신용카드",
          "- 약정 상품은 12/24개월. 약정 없는 선불 유심도 가능.",
          "- 본인 확인: 영상통화 또는 매장 방문 (본인 인증 안 되면 가입 불가)",
          "",
          "톤: 짧고 명확하게. 한국어로 답변 → 자동으로 신청자 언어({{applicant.language}})로 번역됨.",
          "응답 길이: 3-5문장. 마지막에 다음 질문 1개 제안.",
          "민감 사안(요금 분쟁, 환불, 명의도용 등)은 '잠시만요, 매니저가 직접 도와드리겠습니다'로 인계.",
        ].join("\n"),
        userTemplate: [
          "[신청자 컨텍스트]",
          "- 이름: {{applicant.name}}",
          "- 국적: {{applicant.nationality}}",
          "- 모국어: {{applicant.language}}",
          "- 상담 상태: {{applicant.status}}",
          "",
          "[신청자 메시지 (모국어 → 한국어 자동번역됨)]",
          "{{message}}",
        ].join("\n"),
      },
    },
    {
      id: "esc-existing",
      type: "escalate",
      position: { x: 440, y: 500 },
      data: {
        kind: "escalate",
        label: "매니저 인계",
        reason: "이미 진행 중인 상담은 매니저가 직접 응대합니다.",
        assignToManagerId: null,
      },
    },
  ];

  const flowEdges = [
    {
      id: "e-start-greet",
      source: "start",
      target: "msg-greet",
      markerEnd: { type: "arrowclosed" },
    },
    {
      id: "e-greet-cond",
      source: "msg-greet",
      target: "cond-status",
      markerEnd: { type: "arrowclosed" },
    },
    {
      id: "e-cond-true",
      source: "cond-status",
      sourceHandle: "true",
      target: "llm-reply",
      label: "신규",
      markerEnd: { type: "arrowclosed" },
    },
    {
      id: "e-cond-false",
      source: "cond-status",
      sourceHandle: "false",
      target: "esc-existing",
      label: "기존",
      markerEnd: { type: "arrowclosed" },
    },
  ];

  await prisma.chatbotFlow.upsert({
    where: { id: "seed-flow-default" },
    update: {
      nodesData: JSON.stringify(flowNodes),
      edgesData: JSON.stringify(flowEdges),
      status: "PUBLISHED",
    },
    create: {
      id: "seed-flow-default",
      name: "기본 외국인 가입 상담 봇",
      description:
        "신청자의 첫 메시지에 자동 인사 + 신규/기존 분기. PUBLISHED 상태이므로 실제 트리거됨.",
      status: "PUBLISHED",
      createdBy: admin.id,
      nodesData: JSON.stringify(flowNodes),
      edgesData: JSON.stringify(flowEdges),
    },
  });
  console.log(`  ✓ 기본 PUBLISHED 플로우 (start→message→condition→{llm,escalate})`);

  // ── 추가 DRAFT 플로우: 긴급 키워드 즉시 매니저 인계 ─────
  // ('환불', '항의', '명의도용' 등 민감 키워드 감지)
  const urgentNodes = [
    {
      id: "start",
      type: "start",
      position: { x: 250, y: 60 },
      data: {
        kind: "start",
        label: "긴급 키워드 트리거",
        trigger: "keyword_match",
        triggerValue: "환불",
      },
      deletable: false,
    },
    {
      id: "msg-ack",
      type: "message",
      position: { x: 250, y: 200 },
      data: {
        kind: "message",
        label: "긴급 응답",
        text: "긴급한 사안이 감지되었습니다. 즉시 담당 매니저에게 연결해드릴게요.",
        language: "KO_KR",
      },
    },
    {
      id: "esc-urgent",
      type: "escalate",
      position: { x: 250, y: 340 },
      data: {
        kind: "escalate",
        label: "긴급 인계",
        reason: "긴급 키워드 감지 — 환불/항의/명의도용",
        assignToManagerId: null,
      },
    },
  ];
  const urgentEdges = [
    {
      id: "e-start-ack",
      source: "start",
      target: "msg-ack",
      markerEnd: { type: "arrowclosed" },
    },
    {
      id: "e-ack-esc",
      source: "msg-ack",
      target: "esc-urgent",
      markerEnd: { type: "arrowclosed" },
    },
  ];
  await prisma.chatbotFlow.upsert({
    where: { id: "seed-flow-urgent" },
    update: {
      nodesData: JSON.stringify(urgentNodes),
      edgesData: JSON.stringify(urgentEdges),
    },
    create: {
      id: "seed-flow-urgent",
      name: "긴급 키워드 매니저 인계",
      description:
        "환불/항의 등 민감 키워드 감지 시 즉시 매니저 인계. (DRAFT — 운영 시 PUBLISHED 변경)",
      status: "DRAFT",
      createdBy: admin.id,
      nodesData: JSON.stringify(urgentNodes),
      edgesData: JSON.stringify(urgentEdges),
    },
  });
  console.log(`  ✓ DRAFT 긴급 인계 플로우 (start[keyword=환불]→message→escalate)`);

  console.log("");
  console.log("✅ 시드 완료\n");
  console.log("로그인 계정:");
  console.log("  - admin@fics.local / admin123 (ADMIN)");
  console.log("  - manager1@fics.local / manager123 (MANAGER)");
  console.log("  - manager2@fics.local / manager123 (MANAGER)");
}

main()
  .catch((e) => {
    console.error("❌ 시드 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
