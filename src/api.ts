import type { Attachment, Comment, Iteration, Story, TapdAppCredentials, TapdToken, Workspace, WorkspaceUser } from "./types.js";

type TapdResponse<T> = {
  status: number;
  info?: string;
  data?: T;
};

type RequestOptions = {
  method?: "GET" | "POST";
  token?: string;
  basic?: TapdAppCredentials;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, string | number | undefined>;
};

export type UploadImageBase64Params = {
  workspaceId: string;
  entryId: string;
  base64Data: string;
  customField?: string;
  owner?: string;
};

export type GetImageParams = {
  workspaceId: string;
  imagePath: string;
};

export type ListStoriesParams = {
  workspaceId: string;
  limit?: number;
  status?: string;
  iterationId?: string;
  label?: string;
};

export function isStoryNotFoundError(error: unknown, storyId?: string): boolean {
  if (!(error instanceof Error)) return false;
  return storyId ? error.message.includes(`未找到需求：${storyId}`) : error.message.includes("未找到需求：");
}

export class TapdClient {
  constructor(private readonly baseUrl = "https://api.tapd.cn") {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<TapdResponse<T>> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const headers = new Headers();
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    if (options.basic) {
      const basic = Buffer.from(`${options.basic.clientId}:${options.basic.clientSecret}`).toString("base64");
      headers.set("Authorization", `Basic ${basic}`);
    }

    let body: URLSearchParams | undefined;
    if (options.body) {
      body = new URLSearchParams();
      for (const [key, value] of Object.entries(options.body)) {
        if (value !== undefined && value !== "") body.set(key, String(value));
      }
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    const response = await fetch(url, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body
    });
    const text = await response.text();
    let json: TapdResponse<T>;
    try {
      json = JSON.parse(text) as TapdResponse<T>;
    } catch {
      throw new Error(`TAPD 返回非 JSON 响应：${text.slice(0, 300)}`);
    }
    if (json.status !== 1) {
      throw new Error(`TAPD API 错误：${json.info ?? "unknown error"} (status=${json.status})`);
    }
    return json;
  }

  async verifyPersonalToken(token: string, workspaceId: string): Promise<Workspace> {
    const response = await this.request<{ Workspace: Record<string, string> }>("/workspaces/get_workspace_info", {
      token,
      query: { workspace_id: workspaceId }
    });
    const workspace = response.data?.Workspace;
    if (!workspace?.id) throw new Error("个人令牌验证成功但响应缺少 Workspace");
    return {
      id: workspace.id,
      name: workspace.name,
      companyId: workspace.company_id
    };
  }

  async requestToken(credentials: TapdAppCredentials): Promise<TapdToken> {
    const response = await this.request<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>("/tokens/request_token", {
      method: "POST",
      basic: credentials,
      body: { grant_type: "client_credentials" }
    });
    const data = response.data;
    if (!data?.access_token) throw new Error("TAPD token 响应缺少 access_token");
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in
    };
  }

  async listWorkspaces(token: string, companyId: string): Promise<Workspace[]> {
    const response = await this.request<Array<{ Workspace: Record<string, string> }>>("/workspaces/projects", {
      token,
      query: { company_id: companyId, category: "project" }
    });
    return (response.data ?? []).map((item) => ({
      id: item.Workspace.id,
      name: item.Workspace.name,
      companyId: item.Workspace.company_id
    }));
  }

  async listUsers(token: string, workspaceId: string): Promise<WorkspaceUser[]> {
    const response = await this.request<Array<Record<string, Record<string, string>>>>("/workspaces/users", {
      token,
      query: { workspace_id: workspaceId, fields: "user,name,email" }
    });
    return (response.data ?? []).map((item) => {
      const user = item.UserWorkspace ?? item.User ?? item;
      return { user: user.user, name: user.name, email: user.email };
    });
  }

  async listIterations(token: string, workspaceId: string): Promise<Iteration[]> {
    const response = await this.request<Array<{ Iteration: Iteration }>>("/iterations", {
      token,
      query: { workspace_id: workspaceId, limit: 100, fields: "id,name,status,startdate,enddate,creator,description" }
    });
    return (response.data ?? []).map((item) => item.Iteration);
  }

  async getStory(token: string, workspaceId: string, storyId: string): Promise<Story> {
    const response = await this.request<Array<{ Story: Story }>>("/stories", {
      token,
      query: {
        workspace_id: workspaceId,
        id: storyId,
        fields: "id,name,status,iteration_id,creator,owner,description,label,created,modified"
      }
    });
    const story = response.data?.[0]?.Story;
    if (!story) throw new Error(`未找到需求：${storyId}`);
    return story;
  }

  async listStories(token: string, params: ListStoriesParams): Promise<Story[]> {
    const response = await this.request<Array<{ Story: Story }>>("/stories", {
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

  async createStory(token: string, payload: Record<string, string | undefined>): Promise<Story> {
    const response = await this.request<{ Story: Story }>("/stories", {
      method: "POST",
      token,
      body: payload
    });
    if (!response.data?.Story) throw new Error("创建需求成功但响应缺少 Story");
    return response.data.Story;
  }

  async updateStory(token: string, payload: Record<string, string | undefined>): Promise<Story> {
    return this.createStory(token, payload);
  }

  async uploadImageBase64(token: string, params: UploadImageBase64Params): Promise<Attachment> {
    const response = await this.request<{ Attachment: Attachment }>("/files/upload_image_base64", {
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
    if (!response.data?.Attachment) throw new Error("上传图片成功但响应缺少 Attachment");
    return response.data.Attachment;
  }

  async getImage(token: string, params: GetImageParams): Promise<Attachment> {
    const response = await this.request<{ Attachment: Attachment }>("/files/get_image", {
      token,
      query: {
        workspace_id: params.workspaceId,
        image_path: params.imagePath
      }
    });
    if (!response.data?.Attachment) throw new Error("获取图片成功但响应缺少 Attachment");
    return response.data.Attachment;
  }

  async addComment(token: string, payload: Record<string, string | undefined>): Promise<Comment> {
    const response = await this.request<{ Comment: Comment }>("/comments", {
      method: "POST",
      token,
      body: payload
    });
    if (!response.data?.Comment) throw new Error("添加评论成功但响应缺少 Comment");
    return response.data.Comment;
  }

  async listComments(token: string, workspaceId: string, storyId: string): Promise<Comment[]> {
    const response = await this.request<Array<{ Comment: Comment }>>("/comments", {
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
