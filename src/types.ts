export type TapdConfig = {
  companyId?: string;
  defaultWorkspaceId?: string;
  defaultWorkspaceName?: string;
  defaultCreator?: string;
  workspaces?: Array<{
    id: string;
    name: string;
    companyId?: string;
  }>;
};

export type TapdAppCredentials = {
  mode?: "app";
  clientId: string;
  clientSecret: string;
};

export type TapdPersonalCredentials = {
  mode: "personal";
  personalToken: string;
};

export type TapdCredentials = TapdAppCredentials | TapdPersonalCredentials;

export type TapdToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};

export type Workspace = {
  id: string;
  name: string;
  companyId?: string;
};

export type WorkspaceUser = {
  user: string;
  name?: string;
  email?: string;
};

export type Iteration = {
  id: string;
  name: string;
  status?: string;
  startdate?: string;
  enddate?: string;
  creator?: string;
  description?: string;
};

export type Story = {
  id: string;
  name: string;
  status?: string;
  iteration_id?: string;
  creator?: string;
  owner?: string;
  label?: string;
  description?: string;
  created?: string;
  modified?: string;
};

export type Comment = {
  id: string;
  title?: string;
  description?: string;
  author?: string;
  entry_type?: string;
  entry_id?: string;
  created?: string;
  modified?: string;
  workspace_id?: string;
};

export type Attachment = {
  id: string;
  type?: string;
  entry_id?: string;
  filename?: string;
  description?: string | null;
  content_type?: string;
  created?: string;
  workspace_id?: string;
  owner?: string;
  download_url?: string;
};

export type StoryFrontmatter = {
  tapd_id?: string;
  title?: string;
  workspace_id?: string;
  iteration_id?: string;
  creator?: string;
  owner?: string;
  label?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};
