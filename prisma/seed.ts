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
  }
  console.log(`  ✓ 신청자 ${applicantSeeds.length}명 + 채팅방 생성`);

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
