// Polyfill for the `Dict` global type referenced by @anthropic-ai/claude-code SDK declarations
declare type Dict<T> = Record<string, T>
