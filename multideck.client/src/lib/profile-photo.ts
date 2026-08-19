import { supabase } from "@/lib/supabase"
import { invalidateWorkspaceBootstrap } from "@/lib/workspace-bootstrap"

export const profilePhotoBucket = "profile-photos" as const
export const profilePhotoMaxBytes = 5 * 1024 * 1024
export const profilePhotoAcceptedTypes = ["image/jpeg", "image/png", "image/webp"] as const

export type ProfilePhotoMimeType = (typeof profilePhotoAcceptedTypes)[number]

export type UserProfilePhoto = {
  bucket: typeof profilePhotoBucket
  path: string
  mimeType: ProfilePhotoMimeType
  sizeBytes: number
  updatedAt: string
}

export class ProfilePhotoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProfilePhotoValidationError"
  }
}

function requireSupabase() {
  if (!supabase) throw new Error("Profile photos are unavailable until this workspace is connected to Supabase.")
  return supabase
}

function normalizeProfilePhoto(value: unknown): UserProfilePhoto | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null

  const candidate = row as Record<string, unknown>
  if (
    candidate.bucket !== profilePhotoBucket
    || typeof candidate.path !== "string"
    || !profilePhotoAcceptedTypes.includes(candidate.mimeType as ProfilePhotoMimeType)
    || typeof candidate.sizeBytes !== "number"
    || typeof candidate.updatedAt !== "string"
  ) {
    return null
  }

  return {
    bucket: profilePhotoBucket,
    path: candidate.path,
    mimeType: candidate.mimeType as ProfilePhotoMimeType,
    sizeBytes: candidate.sizeBytes,
    updatedAt: candidate.updatedAt,
  }
}

function bytesMatch(bytes: Uint8Array, expected: number[], offset = 0) {
  return expected.every((value, index) => bytes[index + offset] === value)
}

async function detectImageMimeType(file: File): Promise<ProfilePhotoMimeType | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"

  return null
}

export async function validateProfilePhoto(file: File): Promise<ProfilePhotoMimeType> {
  if (file.size < 1) throw new ProfilePhotoValidationError("Choose a photo that is not empty.")
  if (file.size > profilePhotoMaxBytes) throw new ProfilePhotoValidationError("Choose a photo smaller than 5 MB.")

  const detectedType = await detectImageMimeType(file)
  if (!detectedType || !profilePhotoAcceptedTypes.includes(detectedType)) {
    throw new ProfilePhotoValidationError("Choose a JPG, PNG, or WebP image.")
  }

  if (file.type && file.type !== detectedType) {
    throw new ProfilePhotoValidationError("The photo content does not match its file type.")
  }

  return detectedType
}

export async function loadCurrentUserProfilePhoto(): Promise<UserProfilePhoto | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc("get_current_user_profile_photo")
  if (error) throw error

  return normalizeProfilePhoto(data)
}

export async function loadCurrentUserCoverPhoto(): Promise<UserProfilePhoto | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc("get_current_user_cover_photo")
  if (error) throw error

  return normalizeProfilePhoto(data)
}

export async function createProfilePhotoSignedUrl(photo: UserProfilePhoto, expiresInSeconds = 3600) {
  const client = requireSupabase()
  const { data, error } = await client.storage.from(photo.bucket).createSignedUrl(photo.path, expiresInSeconds)
  if (error) throw error

  return data.signedUrl
}

export async function createProfilePhotoSignedUrls(photos: readonly UserProfilePhoto[], expiresInSeconds = 3600): Promise<Map<string, string>> {
  const client = requireSupabase()
  const uniquePaths = [...new Set(photos.filter((photo) => photo.bucket === profilePhotoBucket).map((photo) => photo.path))]
  if (uniquePaths.length === 0) return new Map<string, string>()

  const { data, error } = await client.storage.from(profilePhotoBucket).createSignedUrls(uniquePaths, expiresInSeconds)
  if (error) throw error

  return new Map(
    data
      .filter((item): item is typeof item & { path: string; signedUrl: string } => typeof item.path === "string" && typeof item.signedUrl === "string")
      .map((item) => [item.path, item.signedUrl]),
  )
}

export async function uploadCurrentUserProfilePhoto(
  file: File,
  previousPhoto: UserProfilePhoto | null,
): Promise<UserProfilePhoto> {
  const client = requireSupabase()
  const mimeType = await validateProfilePhoto(file)
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error("Sign in again before changing your profile photo.")

  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]
  const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from(profilePhotoBucket).upload(path, file, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false,
  })
  if (uploadError) throw uploadError

  try {
    const { data, error } = await client.rpc("set_current_user_profile_photo", {
      p_bucket: profilePhotoBucket,
      p_path: path,
      p_mime_type: mimeType,
      p_size_bytes: file.size,
    })
    if (error) throw error

    const savedPhoto = normalizeProfilePhoto(data)
    if (!savedPhoto) throw new Error("Supabase did not return the saved profile photo metadata.")
    invalidateWorkspaceBootstrap()

    if (previousPhoto?.path && previousPhoto.path !== savedPhoto.path) {
      const { error: cleanupError } = await client.storage.from(previousPhoto.bucket).remove([previousPhoto.path])
      if (cleanupError) console.warn("The previous profile photo could not be removed.", cleanupError)
    }

    return savedPhoto
  } catch (error) {
    await client.storage.from(profilePhotoBucket).remove([path])
    throw error
  }
}

export async function removeCurrentUserProfilePhoto(photo: UserProfilePhoto) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("clear_current_user_profile_photo", {
    p_expected_path: photo.path,
  })
  if (error) throw error
  if (data !== true) throw new Error("This profile photo changed elsewhere. Refresh and try again.")
  invalidateWorkspaceBootstrap()

  const { error: removeError } = await client.storage.from(photo.bucket).remove([photo.path])
  return { storageCleanupPending: Boolean(removeError) }
}

export async function uploadCurrentUserCoverPhoto(
  file: File,
  previousPhoto: UserProfilePhoto | null,
): Promise<UserProfilePhoto> {
  const client = requireSupabase()
  const mimeType = await validateProfilePhoto(file)
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error("Sign in again before changing your cover photo.")

  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]
  const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from(profilePhotoBucket).upload(path, file, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false,
  })
  if (uploadError) throw uploadError

  try {
    const { data, error } = await client.rpc("set_current_user_cover_photo", {
      p_bucket: profilePhotoBucket,
      p_path: path,
      p_mime_type: mimeType,
      p_size_bytes: file.size,
    })
    if (error) throw error

    const savedPhoto = normalizeProfilePhoto(data)
    if (!savedPhoto) throw new Error("Supabase did not return the saved cover photo metadata.")
    invalidateWorkspaceBootstrap()

    if (previousPhoto?.path && previousPhoto.path !== savedPhoto.path) {
      const { error: cleanupError } = await client.storage.from(previousPhoto.bucket).remove([previousPhoto.path])
      if (cleanupError) console.warn("The previous cover photo could not be removed.", cleanupError)
    }

    return savedPhoto
  } catch (error) {
    await client.storage.from(profilePhotoBucket).remove([path])
    throw error
  }
}

export async function removeCurrentUserCoverPhoto(photo: UserProfilePhoto) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("clear_current_user_cover_photo", {
    p_expected_path: photo.path,
  })
  if (error) throw error
  if (data !== true) throw new Error("This cover photo changed elsewhere. Refresh and try again.")
  invalidateWorkspaceBootstrap()

  const { error: removeError } = await client.storage.from(photo.bucket).remove([photo.path])
  return { storageCleanupPending: Boolean(removeError) }
}
