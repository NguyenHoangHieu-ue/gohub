const YT_ID = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/

export const youtubeId = (url: string): string | null => url.trim().match(YT_ID)?.[1] ?? null
