import type { Workspace, Media } from "../shared/model";
export async function request<T>(
  path: string,
  csrf?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      "Jaringan lambat atau terputus. Muat ulang untuk memeriksa hasil sebelum mengulang aksi.",
    );
  }
  if (r.status === 401)
    throw new Error("Sesi dashboard kedaluwarsa. Login ulang dengan GitHub.");
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}
export const getWorkspace = () => request<Workspace>("/api/workspace");
export async function inspectFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    if (["image/jpeg", "image/webp", "image/png"].includes(file.type)) {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }
    if (!["video/mp4", "video/quicktime"].includes(file.type))
      throw new Error("Pilih JPEG, PNG, WEBP, MP4 atau MOV.");
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Video tidak dapat dibaca."));
    });
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function uploadFile(
  file: File,
  csrf: string,
  onProgress: (n: number) => void,
  accountId?: string,
): Promise<Media> {
  const meta = await inspectFile(file);
  const init = await request<{
    id: string;
    multipart: boolean;
    partSize: number;
    url?: string;
  }>("/api/media/initiate", csrf, "POST", {
    account_id: accountId,
    filename: file.name,
    mime: file.type,
    size: file.size,
    ...meta,
  });
  try {
    const parts: { PartNumber: number; ETag: string }[] = [];
    if (init.multipart) {
      const count = Math.ceil(file.size / init.partSize);
      for (let i = 0; i < count; i++) {
        const { url } = await request<{ url: string }>(
          `/api/media/${init.id}/part`,
          csrf,
          "POST",
          { part_number: i + 1 },
        );
        const r = await fetch(url, {
          method: "PUT",
          body: file.slice(i * init.partSize, (i + 1) * init.partSize),
        });
        if (!r.ok)
          throw new Error("Upload part gagal. Periksa CORS bucket R2.");
        const ETag = r.headers.get("etag");
        if (!ETag)
          throw new Error(
            "ETag tidak tersedia; tambahkan ExposeHeaders pada CORS R2.",
          );
        parts.push({ PartNumber: i + 1, ETag });
        onProgress(Math.round(((i + 1) / count) * 95));
      }
    } else {
      const r = await fetch(init.url!, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!r.ok)
        throw new Error("Upload gagal. Periksa konfigurasi CORS bucket R2.");
      onProgress(95);
    }
    const media = await request<Media>(
      `/api/media/${init.id}/complete`,
      csrf,
      "POST",
      { parts: init.multipart ? parts : undefined },
    );
    onProgress(100);
    return media;
  } catch (e) {
    await request(`/api/media/${init.id}/abort`, csrf, "POST", {}).catch(
      () => undefined,
    );
    throw e;
  }
}
