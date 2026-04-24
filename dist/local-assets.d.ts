import type { TapdClient } from "./api.js";
import type { Attachment } from "./types.js";
export type LocalImage = {
    index: number;
    placeholder: string;
    base64: string;
    alt: string;
    sourcePath: string;
    attachment?: Attachment;
};
export type LocalImageConversionResult = {
    content: string;
    templateContent: string;
    images: LocalImage[];
};
export type ConvertLocalImageReferencesOptions = {
    client: TapdClient;
    token: string;
    workspaceId: string;
    storyId: string;
    markdownFile: string;
    owner?: string;
};
export declare function hasLocalImageReferences(markdown: string): boolean;
export declare function stripLocalDocumentLinks(markdown: string): string;
export declare function convertLocalImageReferences(markdown: string, options: ConvertLocalImageReferencesOptions): Promise<LocalImageConversionResult>;
export declare function renderLocalImageTemplate(templateContent: string, images: LocalImage[], imageSrc: (image: LocalImage) => string | undefined): string;
export declare function imageDataUri(base64: string, filePath: string): string;
