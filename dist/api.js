export function isStoryNotFoundError(error, storyId) {
    if (!(error instanceof Error))
        return false;
    return storyId ? error.message.includes(`未找到需求：${storyId}`) : error.message.includes("未找到需求：");
}
export class TapdClient {
    baseUrl;
    constructor(baseUrl = "https://api.tapd.cn") {
        this.baseUrl = baseUrl;
    }
    async request(path, options = {}) {
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined && value !== "")
                url.searchParams.set(key, String(value));
        }
        const headers = new Headers();
        if (options.token)
            headers.set("Authorization", `Bearer ${options.token}`);
        if (options.basic) {
            const basic = Buffer.from(`${options.basic.clientId}:${options.basic.clientSecret}`).toString("base64");
            headers.set("Authorization", `Basic ${basic}`);
        }
        let body;
        if (options.body) {
            body = new URLSearchParams();
            for (const [key, value] of Object.entries(options.body)) {
                if (value !== undefined && value !== "")
                    body.set(key, String(value));
            }
            headers.set("Content-Type", "application/x-www-form-urlencoded");
        }
        const response = await fetch(url, {
            method: options.method ?? (body ? "POST" : "GET"),
            headers,
            body
        });
        const text = await response.text();
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            throw new Error(`TAPD 返回非 JSON 响应：${text.slice(0, 300)}`);
        }
        if (json.status !== 1) {
            throw new Error(`TAPD API 错误：${json.info ?? "unknown error"} (status=${json.status})`);
        }
        return json;
    }
    async verifyPersonalToken(token, workspaceId) {
        const response = await this.request("/workspaces/get_workspace_info", {
            token,
            query: { workspace_id: workspaceId }
        });
        const workspace = response.data?.Workspace;
        if (!workspace?.id)
            throw new Error("个人令牌验证成功但响应缺少 Workspace");
        return {
            id: workspace.id,
            name: workspace.name,
            companyId: workspace.company_id
        };
    }
    async requestToken(credentials) {
        const response = await this.request("/tokens/request_token", {
            method: "POST",
            basic: credentials,
            body: { grant_type: "client_credentials" }
        });
        const data = response.data;
        if (!data?.access_token)
            throw new Error("TAPD token 响应缺少 access_token");
        return {
            accessToken: data.access_token,
            tokenType: data.token_type,
            expiresIn: data.expires_in
        };
    }
    async listWorkspaces(token, companyId) {
        const response = await this.request("/workspaces/projects", {
            token,
            query: { company_id: companyId, category: "project" }
        });
        return (response.data ?? []).map((item) => ({
            id: item.Workspace.id,
            name: item.Workspace.name,
            companyId: item.Workspace.company_id
        }));
    }
    async listUsers(token, workspaceId) {
        const response = await this.request("/workspaces/users", {
            token,
            query: { workspace_id: workspaceId, fields: "user,name,email" }
        });
        return (response.data ?? []).map((item) => {
            const user = item.UserWorkspace ?? item.User ?? item;
            return { user: user.user, name: user.name, email: user.email };
        });
    }
    async listIterations(token, workspaceId) {
        const response = await this.request("/iterations", {
            token,
            query: { workspace_id: workspaceId, limit: 100, fields: "id,name,status,startdate,enddate,creator,description" }
        });
        return (response.data ?? []).map((item) => item.Iteration);
    }
    async getStory(token, workspaceId, storyId) {
        const response = await this.request("/stories", {
            token,
            query: {
                workspace_id: workspaceId,
                id: storyId,
                fields: "id,name,status,iteration_id,creator,owner,description,label,created,modified"
            }
        });
        const story = response.data?.[0]?.Story;
        if (!story)
            throw new Error(`未找到需求：${storyId}`);
        return story;
    }
    async listStories(token, params) {
        const response = await this.request("/stories", {
            token,
            query: {
                workspace_id: params.workspaceId,
                limit: params.limit ?? 100,
                fields: "id,name,status,iteration_id,creator,owner,label,created,modified",
                status: params.status,
                iteration_id: params.iterationId,
                label: params.label
            }
        });
        return (response.data ?? []).map((item) => item.Story);
    }
    async createStory(token, payload) {
        const response = await this.request("/stories", {
            method: "POST",
            token,
            body: payload
        });
        if (!response.data?.Story)
            throw new Error("创建需求成功但响应缺少 Story");
        return response.data.Story;
    }
    async updateStory(token, payload) {
        return this.createStory(token, payload);
    }
    async uploadImageBase64(token, params) {
        const response = await this.request("/files/upload_image_base64", {
            method: "POST",
            token,
            body: {
                workspace_id: params.workspaceId,
                type: "story_custom_field",
                custom_field: params.customField ?? "description",
                entry_id: params.entryId,
                base64_data: params.base64Data,
                owner: params.owner
            }
        });
        if (!response.data?.Attachment)
            throw new Error("上传图片成功但响应缺少 Attachment");
        return response.data.Attachment;
    }
    async getImage(token, params) {
        const response = await this.request("/files/get_image", {
            token,
            query: {
                workspace_id: params.workspaceId,
                image_path: params.imagePath
            }
        });
        if (!response.data?.Attachment)
            throw new Error("获取图片成功但响应缺少 Attachment");
        return response.data.Attachment;
    }
    async addComment(token, payload) {
        const response = await this.request("/comments", {
            method: "POST",
            token,
            body: payload
        });
        if (!response.data?.Comment)
            throw new Error("添加评论成功但响应缺少 Comment");
        return response.data.Comment;
    }
    async listComments(token, workspaceId, storyId) {
        const response = await this.request("/comments", {
            token,
            query: {
                workspace_id: workspaceId,
                entry_type: "stories",
                entry_id: storyId,
                limit: 100,
                order: "created desc",
                fields: "id,title,description,author,entry_type,entry_id,created,modified,workspace_id"
            }
        });
        return (response.data ?? []).map((item) => item.Comment);
    }
}
//# sourceMappingURL=api.js.map