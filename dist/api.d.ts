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
export type ListStoriesParams = {
    workspaceId: string;
    limit?: number;
    status?: string;
    iterationId?: string;
    label?: string;
};
export declare function isStoryNotFoundError(error: unknown, storyId?: string): boolean;
export declare class TapdClient {
    private readonly baseUrl;
    constructor(baseUrl?: string);
    request<T>(path: string, options?: RequestOptions): Promise<TapdResponse<T>>;
    verifyPersonalToken(token: string, workspaceId: string): Promise<Workspace>;
    requestToken(credentials: TapdAppCredentials): Promise<TapdToken>;
    listWorkspaces(token: string, companyId: string): Promise<Workspace[]>;
    listUsers(token: string, workspaceId: string): Promise<WorkspaceUser[]>;
    listIterations(token: string, workspaceId: string): Promise<Iteration[]>;
    getStory(token: string, workspaceId: string, storyId: string): Promise<Story>;
    listStories(token: string, params: ListStoriesParams): Promise<Story[]>;
    createStory(token: string, payload: Record<string, string | undefined>): Promise<Story>;
    updateStory(token: string, payload: Record<string, string | undefined>): Promise<Story>;
    uploadImageBase64(token: string, params: UploadImageBase64Params): Promise<Attachment>;
    addComment(token: string, payload: Record<string, string | undefined>): Promise<Comment>;
    listComments(token: string, workspaceId: string, storyId: string): Promise<Comment[]>;
}
export {};
