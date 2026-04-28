import { NextResponse, type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { jwtVerify } from "jose";

/**
 * 첨부파일 업로드 — Phase B1
 *
 * 인증: 매니저 세션 쿠키 OR 신청자 룸 토큰 (Authorization: Bearer)
 * 저장: public/uploads/{yyyy-mm-dd}/{uuid}.{ext}
 * 응답: { url, name, size, mimeType }
 *
 * 제한:
 *  - 최대 10MB
 *  - 허용 MIME: image/jpeg, image/png, image/webp, application/pdf
 *
 * 보안:
 *  - 파일명은 UUID로 재명명 (path traversal / 충돌 방지)
 *  - public/ 아래라 정적 서빙은 자동 (인증된 룸 참여자만 URL 안다는 가정 — MVP)
 *  - 운영 시: S3 + signed URL로 교체 권장
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// MIME 타입 → 강제 확장자 매핑 (사용자 입력 file.name 무시 — XSS 차단)
// 매직 바이트로 한 번 더 검증 (browser MIME 위변조 방지)
const ALLOWED_MIME: Record<
  string,
  { ext: string; magic: (buf: Buffer) => boolean }
> = {
  "image/jpeg": {
    ext: ".jpg",
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/jpg": {
    ext: ".jpg",
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    ext: ".png",
    magic: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  "image/webp": {
    ext: ".webp",
    magic: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  "application/pdf": {
    ext: ".pdf",
    magic: (b) =>
      b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
};

const SECRET = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

async function authenticate(req: NextRequest): Promise<{ ok: boolean; reason?: string }> {
  // 1) 매니저 세션 쿠키
  const cookie = req.cookies.get("fics_session")?.value;
  if (cookie) {
    try {
      const { payload } = await jwtVerify(cookie, SECRET());
      if (payload.managerId) return { ok: true };
    } catch {}
  }

  // 2) 신청자 룸 토큰 (Bearer)
  const authH = req.headers.get("authorization");
  if (authH?.startsWith("Bearer ")) {
    const token = authH.slice(7);
    try {
      const { payload } = await jwtVerify(token, SECRET());
      if (payload.kind === "applicant" && payload.roomId) return { ok: true };
    } catch {}
  }

  return { ok: false, reason: "UNAUTHENTICATED" };
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_FORM_DATA" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "FILE_FIELD_REQUIRED" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `MAX_${MAX_BYTES}_BYTES` },
      { status: 413 }
    );
  }
  const mimeMeta = ALLOWED_MIME[file.type];
  if (!mimeMeta) {
    return NextResponse.json(
      { ok: false, error: `MIME_NOT_ALLOWED:${file.type}` },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 매직 바이트 검증 — browser-claimed MIME 위변조 차단
  if (buffer.length < 12 || !mimeMeta.magic(buffer)) {
    return NextResponse.json(
      { ok: false, error: "MAGIC_BYTES_MISMATCH" },
      { status: 415 }
    );
  }

  // 날짜 디렉토리
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const subdir = `${yyyy}-${mm}-${dd}`;

  const dir = join(process.cwd(), "public", "uploads", subdir);
  await mkdir(dir, { recursive: true });

  // 확장자 — file.name 무시. MIME 타입에서 강제 매핑 (.html 등 위장 차단)
  const id = randomUUID();
  const filename = `${id}${mimeMeta.ext}`;
  const fullPath = join(dir, filename);
  await writeFile(fullPath, buffer);

  // file.name도 안전하게 정리해서 표시용으로 보관 (DB attachments.name)
  const safeName =
    file.name
      .replace(/[\r\n\t\\/]/g, "")
      .replace(/[^\p{L}\p{N}\.\-_ ]/gu, "")
      .slice(0, 120) || `attachment${mimeMeta.ext}`;

  const url = `/uploads/${subdir}/${filename}`;
  return NextResponse.json({
    ok: true,
    data: {
      url,
      name: safeName,
      size: file.size,
      mimeType: file.type,
    },
  });
}
