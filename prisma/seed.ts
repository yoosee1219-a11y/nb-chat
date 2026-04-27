/**
 * 시드 스크립트
 * 실행: npx tsx prisma/seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
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
      description: "외국인 입문자용 가성비 요금제",
    },
    {
      name: "5G 스탠다드",
      carrier: "LGU+",
      monthlyFee: 55000,
      dataAllowance: "30GB",
      voiceMinutes: "무제한",
      smsCount: "무제한",
      description: "일상 사용에 적합",
    },
    {
      name: "5G 프리미엄",
      carrier: "LGU+",
      monthlyFee: 85000,
      dataAllowance: "무제한",
      voiceMinutes: "무제한",
      smsCount: "무제한",
      description: "고용량 데이터 사용자용",
    },
    {
      name: "유심 요금제 베이직",
      carrier: "LGU+",
      monthlyFee: 22000,
      dataAllowance: "3GB",
      voiceMinutes: "100분",
      smsCount: "100건",
      description: "단기 체류용",
    },
  ];

  const plans = [];
  for (const p of planSeeds) {
    const created = await prisma.plan.upsert({
      where: { id: `seed-plan-${p.name}` },
      update: {},
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
