import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

const TICKTICK_API = "https://api.ticktick.com/open/v1";

function getBearerToken(request: Request) {
	const auth = request.headers.get("Authorization");

	if (!auth?.startsWith("Bearer ")) {
		throw new Error("Missing Authorization bearer token");
	}

	return auth.slice("Bearer ".length);
}

async function ticktick(token: string, path: string, options: RequestInit = {}) {
	const res = await fetch(`${TICKTICK_API}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...(options.headers ?? {}),
		},
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`TickTick API error ${res.status}: ${text}`);
	}

	const text = await res.text();
	return text ? JSON.parse(text) : { ok: true };
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "TickTick MCP",
		version: "1.0.0",
	});

	async init() {
		this.server.registerTool(
			"get_projects",
			{
				description: "TickTick 프로젝트 목록을 가져옵니다.",
				inputSchema: {},
			},
			async () => {
				const token = getBearerToken(this.props.request as Request);
				const projects = await ticktick(token, "/project");

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(projects, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"get_project_data",
			{
				description: "프로젝트의 미완료 작업과 컬럼을 가져옵니다.",
				inputSchema: {
					projectId: z.string(),
				},
			},
			async ({ projectId }) => {
				const token = getBearerToken(this.props.request as Request);
				const data = await ticktick(token, `/project/${projectId}/data`);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"create_task",
			{
				description: "TickTick 작업을 생성합니다. projectId와 title은 필수입니다.",
				inputSchema: {
					projectId: z.string(),
					title: z.string(),
					content: z.string().optional(),
					dueDate: z.string().optional(),
					startDate: z.string().optional(),
					isAllDay: z.boolean().optional(),
					priority: z.enum(["0", "1", "3", "5"]).optional(),
					timeZone: z.string().optional(),
				},
			},
			async (input) => {
				const token = getBearerToken(this.props.request as Request);

				const task = await ticktick(token, "/task", {
					method: "POST",
					body: JSON.stringify({
						...input,
						priority: input.priority ? Number(input.priority) : undefined,
					}),
				});

				return {
					content: [
						{
							type: "text",
							text: `"${task.title}" 작업을 만들었어요.\n\n${JSON.stringify(task, null, 2)}`,
						},
					],
				};
			},
		);

		this.server.registerTool(
			"complete_task",
			{
				description: "TickTick 작업을 완료 처리합니다.",
				inputSchema: {
					projectId: z.string(),
					taskId: z.string(),
				},
			},
			async ({ projectId, taskId }) => {
				const token = getBearerToken(this.props.request as Request);

				await ticktick(token, `/project/${projectId}/task/${taskId}/complete`, {
					method: "POST",
				});

				return {
					content: [{ type: "text", text: "작업을 완료 처리했어요." }],
				};
			},
		);

		this.server.registerTool(
			"delete_task",
			{
				description: "TickTick 작업을 삭제합니다.",
				inputSchema: {
					projectId: z.string(),
					taskId: z.string(),
				},
			},
			async ({ projectId, taskId }) => {
				const token = getBearerToken(this.props.request as Request);

				await ticktick(token, `/project/${projectId}/task/${taskId}`, {
					method: "DELETE",
				});

				return {
					content: [{ type: "text", text: "작업을 삭제했어요." }],
				};
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
