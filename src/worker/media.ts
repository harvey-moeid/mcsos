import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { Store, AppError } from "./store";
import { SocialService } from "./service";
import type { RuntimeEnv } from "./platforms";
import type { Media } from "../shared/model";
export const mediaInput = z.object({
  account_id: z.string().regex(/^[\w-]{1,100}$/).optional(),
  filename: z.string().min(1).max(150),
  mime: z.enum(["image/jpeg", "image/webp", "image/png", "video/mp4", "video/quicktime"]),
  size: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
  width: z.number().positive(),
  height: z.number().positive(),
  duration: z.number().positive().optional(),
});
function client(env: RuntimeEnv) {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    throw new AppError(503, "Direct upload R2 belum dikonfigurasi.");
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}
interface Pending {
  media: Media;
  uploadId?: string;
  expiresAt: number;
}
export function jpegDimensions(b: Uint8Array) {
  if (b[0] !== 255 || b[1] !== 216)
    throw new AppError(400, "Header JPEG tidak valid.");
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 255) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xda) break;
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return {
        height: (b[i + 5] << 8) | b[i + 6],
        width: (b[i + 7] << 8) | b[i + 8],
      };
    i += 2 + len;
  }
  throw new AppError(400, "Dimensi JPEG tidak dapat divalidasi.");
}
export function imageDimensions(b: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return jpegDimensions(b);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (mime === "image/png" && b.length >= 24 && [137,80,78,71,13,10,26,10].every((x,i) => b[i] === x) && v.getUint32(12) === 0x49484452)
    return { width: v.getUint32(16), height: v.getUint32(20) };
  const ascii = (offset: number) => String.fromCharCode(...b.slice(offset, offset + 4));
  if (mime === "image/webp" && b.length >= 30 && ascii(0) === "RIFF" && ascii(8) === "WEBP") {
    if (ascii(12) === "VP8X") return { width: 1 + b[24] + (b[25] << 8) + (b[26] << 16), height: 1 + b[27] + (b[28] << 8) + (b[29] << 16) };
    if (ascii(12) === "VP8 " && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) return { width: v.getUint16(26,true) & 0x3fff, height: v.getUint16(28,true) & 0x3fff };
    if (ascii(12) === "VP8L" && b[20] === 0x2f) return { width: 1 + ((b[22] & 0x3f) << 8 | b[21]), height: 1 + ((b[24] & 15) << 10 | b[23] << 2 | b[22] >> 6) };
  }
  throw new AppError(400, "Header gambar tidak valid atau format tidak didukung.");
}
function videoMetadata(b: Uint8Array) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength),
    ascii = (offset: number) =>
      String.fromCharCode(...b.slice(offset, offset + 4));
  let result: { width: number; height: number; duration: number } | undefined;
  function boxes(start: number, end: number) {
    const found: { type: string; start: number; end: number; data: number }[] =
      [];
    let p = start;
    while (p + 8 <= end) {
      let size = view.getUint32(p),
        header = 8;
      if (size === 1) {
        if (p + 16 > end) break;
        size = Number(view.getBigUint64(p + 8));
        header = 16;
      }
      if (size === 0) size = end - p;
      if (size < header || p + size > end) break;
      found.push({
        type: ascii(p + 4),
        start: p,
        end: p + size,
        data: p + header,
      });
      p += size;
    }
    return found;
  }
  const moov = [];
  for (let i = 4; i + 4 < b.length; i++) {
    if (view.getUint32(i) === 0x6d6f6f76) {
      const size = view.getUint32(i - 4);
      if (size >= 8 && i - 4 + size <= b.length)
        moov.push({ data: i + 4, end: i - 4 + size });
    }
  }
  for (const m of moov)
    for (const track of boxes(m.data, m.end).filter((x) => x.type === "trak")) {
      const children = boxes(track.data, track.end),
        tk = children.find((x) => x.type === "tkhd"),
        mdia = children.find((x) => x.type === "mdia");
      if (!tk || !mdia) continue;
      const inner = boxes(mdia.data, mdia.end),
        hdlr = inner.find((x) => x.type === "hdlr"),
        mdhd = inner.find((x) => x.type === "mdhd");
      if (!hdlr || !mdhd || ascii(hdlr.data + 8) !== "vide") continue;
      const v = b[mdhd.data],
        timeOffset = mdhd.data + (v === 1 ? 20 : 12);
      if (timeOffset + 12 > mdhd.end) continue;
      const scale = view.getUint32(timeOffset),
        duration =
          v === 1
            ? Number(view.getBigUint64(timeOffset + 4))
            : view.getUint32(timeOffset + 4);
      const width = view.getUint32(tk.end - 8) / 65536,
        height = view.getUint32(tk.end - 4) / 65536;
      if (scale && width && height)
        result = { width, height, duration: duration / scale };
    }
  if (!result)
    throw new AppError(
      400,
      "Metadata MP4/MOV tidak dapat divalidasi; gunakan file dengan moov atom standar (fast start).",
    );
  return result;
}
async function inspect(env: RuntimeEnv, m: Media) {
  const head = await env.DATA.get(m.key, {
    range: { offset: 0, length: Math.min(m.size, 1024 * 1024) },
  });
  if (!head) throw new AppError(400, "File upload belum tersedia.");
  const bytes = new Uint8Array(await head.arrayBuffer());
  if (m.mime.startsWith("image/")) {
    const dimensions = imageDimensions(bytes, m.mime);
    if (!dimensions.width || !dimensions.height || dimensions.width > 20000 || dimensions.height > 20000 || dimensions.width * dimensions.height > 100000000 || m.size > 20 * 1024 ** 2) throw new AppError(400, "Dimensi atau ukuran gambar terlalu besar.");
    return { ...m, ...dimensions, verified: true };
  }
  if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
    throw new AppError(400, "File bukan MP4/MOV yang didukung.");
  try {
    return { ...m, ...videoMetadata(bytes), verified: true };
  } catch {
    const tail = await env.DATA.get(m.key, {
      range: { suffix: Math.min(m.size, 4 * 1024 * 1024) },
    });
    if (!tail) throw new AppError(400, "File tidak tersedia.");
    return {
      ...m,
      ...videoMetadata(new Uint8Array(await tail.arrayBuffer())),
      verified: true,
    };
  }
}
export async function initiateUpload(env: RuntimeEnv, input: unknown) {
  const p = mediaInput.parse(input),
    id = crypto.randomUUID();
  if (p.account_id) await new SocialService(env).account(p.account_id);
  const filename = p.filename.replace(/[^\w. -]/g, "_");
  const media: Media = {
    accountId: p.account_id,
    id,
    key: `media/${id}/${filename}`,
    filename,
    mime: p.mime,
    size: p.size,
    width: p.width,
    height: p.height,
    duration: p.duration,
    createdAt: new Date().toISOString(),
    verified: false,
  };
  const s3 = client(env),
    pending: Pending = { media, expiresAt: Date.now() + 3600000 };
  const multipart = p.size > 20 * 1024 * 1024;
  if (multipart) {
    const r = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: media.key,
        ContentType: p.mime,
      }),
    );
    pending.uploadId = r.UploadId;
    if (!pending.uploadId)
      throw new AppError(502, "Multipart upload gagal dimulai.");
  }
  await new Store(env.DATA).put(`uploads/${id}.json`, pending);
  return {
    id,
    multipart,
    partSize: 10 * 1024 * 1024,
    ...(!multipart
      ? {
          url: await getSignedUrl(
            s3,
            new PutObjectCommand({
              Bucket: env.R2_BUCKET_NAME,
              Key: media.key,
              ContentType: p.mime,
            }),
            { expiresIn: 900 },
          ),
        }
      : {}),
  };
}
export async function uploadPartUrl(
  env: RuntimeEnv,
  id: string,
  partNumber: number,
) {
  const p = (await new Store(env.DATA).require<Pending>(`uploads/${id}.json`))
    .value;
  if (
    !p.uploadId ||
    p.expiresAt < Date.now() ||
    partNumber < 1 ||
    partNumber > Math.ceil(p.media.size / (10 * 1024 * 1024))
  )
    throw new AppError(400, "Part upload tidak valid.");
  return {
    url: await getSignedUrl(
      client(env),
      new UploadPartCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: p.media.key,
        UploadId: p.uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 900 },
    ),
  };
}
export async function completeUpload(
  env: RuntimeEnv,
  id: string,
  parts?: { PartNumber: number; ETag: string }[],
) {
  const store = new Store(env.DATA),
    pending = (await store.require<Pending>(`uploads/${id}.json`)).value;
  if (pending.expiresAt < Date.now())
    throw new AppError(400, "Upload kedaluwarsa.");
  if (pending.uploadId) {
    const count = Math.ceil(pending.media.size / (10 * 1024 * 1024));
    if (
      !parts ||
      parts.length !== count ||
      parts.some((p, i) => p.PartNumber !== i + 1)
    )
      throw new AppError(400, "Daftar part tidak lengkap.");
    await client(env).send(
      new CompleteMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: pending.media.key,
        UploadId: pending.uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }
  const o = await env.DATA.head(pending.media.key);
  if (!o || o.size !== pending.media.size)
    throw new AppError(400, "Ukuran file tidak sesuai.");
  const media = await inspect(env, pending.media);
  await store.put(`media-meta/${id}.json`, media);
  await env.DATA.delete(`uploads/${id}.json`);
  await store.log("media.upload", "success", { entityId: id });
  return media;
}
export async function abortUpload(env: RuntimeEnv, id: string) {
  const p = (await new Store(env.DATA).require<Pending>(`uploads/${id}.json`))
    .value;
  if (p.uploadId)
    await client(env).send(
      new AbortMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: p.media.key,
        UploadId: p.uploadId,
      }),
    );
  else await env.DATA.delete(p.media.key);
  await env.DATA.delete(`uploads/${id}.json`);
}
export async function uploadFromChat(
  env: RuntimeEnv,
  p: {
    filename: string;
    mime: string;
    base64: string;
    width: number;
    height: number;
    duration?: number;
  },
) {
  if (p.base64.length > 14_000_000)
    throw new AppError(413, "File chat maksimal 10 MB.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
  } catch {
    throw new AppError(400, "Base64 tidak valid.");
  }
  if (bytes.length > 10 * 1024 * 1024)
    throw new AppError(413, "File chat maksimal 10 MB.");
  const id = crypto.randomUUID(),
    filename = p.filename.replace(/[^\w. -]/g, "_"),
    m: Media = {
      id,
      key: `media/${id}/${filename}`,
      filename,
      mime: p.mime,
      size: bytes.length,
      width: p.width,
      height: p.height,
      duration: p.duration,
      createdAt: new Date().toISOString(),
      verified: false,
    };
  await env.DATA.put(m.key, bytes, { httpMetadata: { contentType: p.mime } });
  try {
    const media = await inspect(env, m);
    await new Store(env.DATA).put(`media-meta/${id}.json`, media);
    return media;
  } catch (e) {
    await env.DATA.delete(m.key);
    throw e;
  }
}
export async function deleteMedia(service: SocialService, id: string) {
  return service.store.locked("media-references", () => deleteMediaUnlocked(service, id));
}
async function deleteMediaUnlocked(service: SocialService, id: string) {
  const meta = await service.store.require<Media>(`media-meta/${id}.json`);
  for (const prefix of ["drafts/", "draft-history/"]) {
  let cursor: string | undefined;
  do {
    const page = await service.store.list<import("../shared/model").Draft>(
      prefix,
      cursor,
      100,
    );
    if (page.items.some((d) => d.mediaIds.includes(id)))
      throw new AppError(
        409,
        "Media masih direferensikan draft. Hapus draft terlebih dahulu.",
      );
    cursor = page.cursor;
  } while (cursor);
  }
  await service.env.DATA.delete([meta.value.key, `media-meta/${id}.json`]);
  await service.store.log("media.delete", "success", { entityId: id });
}
