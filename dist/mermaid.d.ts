import type { Attachment } from "./types.js";
export type MermaidImage = {
    index: number;
    placeholder: string;
    base64: string;
    attachment?: Attachment;
};
export type MermaidConversionResult = {
    content: string;
    templateContent: string;
    images: MermaidImage[];
};
export type ConvertMermaidBlocksOptions = {
    renderBaseUrl?: string;
};
export declare function hasMermaidBlocks(markdown: string): boolean;
export declare function convertMermaidBlocks(markdown: string, options: ConvertMermaidBlocksOptions): Promise<MermaidConversionResult>;
export declare function renderMermaidTemplate(templateContent: string, images: MermaidImage[], imageSrc: (image: MermaidImage) => string | undefined): string;
export declare function imageDataUri(base64: string): string;
export declare function renderMermaidPngBase64(diagram: string, renderBaseUrl?: string): Promise<string>;
