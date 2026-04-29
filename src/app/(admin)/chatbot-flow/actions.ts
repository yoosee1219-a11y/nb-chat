"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canMutate } from "@/lib/permissions";
import {
  executeFlow,
  type ApplicantContext,
  type FlowExecutionResult,
} from "@/lib/flow-runtime";
import type { AnyNodeData } from "./[id]/node-types";

const VALID_STATUS = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type FlowStatus = (typeof VALID_STATUS)[number];

export async function createFlow(input: { name: string; description?: string }) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 챗봇 플로우를 추가할 수 없습니다." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "이름을 입력해주세요." };

  const flow = await prisma.chatbotFlow.create({
    data: {
      name,
      description: input.description?.trim() || null,
      status: "DRAFT",
      createdBy: session.managerId,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "FLOW_CREATED",
    resource: `flow:${flow.id}`,
    metadata: { name },
  });

  revalidatePath("/chatbot-flow");
  redirect(`/chatbot-flow/${flow.id}`);
}

export async function updateFlowMeta(
  id: string,
  input: { name?: string; description?: string; status?: FlowStatus }
) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 챗봇 플로우를 수정할 수 없습니다." };

  if (input.status && !VALID_STATUS.includes(input.status)) {
    return { ok: false, error: "유효하지 않은 상태입니다." };
  }

  const exists = await prisma.chatbotFlow.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "플로우를 찾을 수 없습니다." };

  await prisma.chatbotFlow.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await audit({
    managerId: session.managerId,
    action: "FLOW_UPDATED",
    resource: `flow:${id}`,
    metadata: input,
  });

  revalidatePath("/chatbot-flow");
  revalidatePath(`/chatbot-flow/${id}`);
  return { ok: true };
}

export async function saveFlowGraph(
  id: string,
  graph: { nodes: unknown[]; edges: unknown[] }
) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 챗봇 플로우를 저장할 수 없습니다." };

  const exists = await prisma.chatbotFlow.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return { ok: false, error: "플로우를 찾을 수 없습니다." };

  await prisma.chatbotFlow.update({
    where: { id },
    data: {
      nodesData: JSON.stringify(graph.nodes),
      edgesData: JSON.stringify(graph.edges),
    },
  });

  await audit({
    managerId: session.managerId,
    action: "FLOW_SAVED",
    resource: `flow:${id}`,
    metadata: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
  });

  return { ok: true };
}

export async function deleteFlow(id: string) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 챗봇 플로우를 삭제할 수 없습니다." };

  const exists = await prisma.chatbotFlow.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!exists) return { ok: false, error: "플로우를 찾을 수 없습니다." };

  await prisma.chatbotFlow.delete({ where: { id } });

  await audit({
    managerId: session.managerId,
    action: "FLOW_DELETED",
    resource: `flow:${id}`,
    metadata: { name: exists.name },
  });

  revalidatePath("/chatbot-flow");
  return { ok: true };
}

/**
 * 시뮬레이터에서 호출 — 실 LLM/번역 API를 거치므로 반드시 서버에서 실행.
 * (API 키가 클라이언트에 절대 노출되지 않도록)
 */
export async function simulateFlow(
  graph: { nodes: Node<AnyNodeData>[]; edges: Edge[] },
  ctx: ApplicantContext
): Promise<FlowExecutionResult> {
  await requireSession();
  return executeFlow(graph.nodes, graph.edges, ctx);
}
