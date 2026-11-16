

export const mimeTypeToContentType = {
  // image
  "image/jpeg":         "image",
  "image/png":          "image",
  // "image/webp":         "image",
  // audio
  "audio/aac":          "audio",
  "audio/amr":          "audio",
  "audio/mpeg":         "audio",  // .mp3
  "audio/mp4":          "audio",  // .m4a
  "audio/x-m4a":        "audio",  // .m4a (alternate)
  "audio/ogg":          "audio",
  // video
  "video/mp4":          "video",
  "video/3gpp":         "video",  // .3gp
  "video/quicktime":    "video",  // .mov
  "video/x-msvideo":   "video",  // .avi
  "video/x-matroska":  "video",  // .mkv
  "video/x-flv":       "video",  // .flv
  // document — anything else falls back to "document" via ?? "document"
  "text/plain":                                                              "document",
  "application/pdf":                                                         "document",
};
