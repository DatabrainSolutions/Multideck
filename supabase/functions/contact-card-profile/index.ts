import { adminClient, corsHeaders, failure, HttpError, json } from "../_shared/backend.ts"

function cleanSlug(request: Request) {
  const value = new URL(request.url).searchParams.get("slug")?.trim().toLowerCase() ?? ""
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 120) {
    throw new HttpError(400, "Choose a valid contact card.")
  }
  return value
}

function metadataText(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.")
    const admin = adminClient()
    const slug = cleanSlug(request)
    const { data: card, error: cardError } = await admin
      .from("CRM_ContactCards")
      .select("Owner_User_ID,Company_ID,ContactCard_ShowPhone,ContactCard_ShowWebsite")
      .eq("ContactCard_Slug", slug)
      .eq("ContactCard_Status", "published")
      .is("ContactCard_DeletedAt", null)
      .maybeSingle()
    if (cardError) throw new HttpError(500, cardError.message)
    if (!card) throw new HttpError(404, "This contact card is not active.")

    const [{ data: owner, error: ownerError }, { data: company, error: companyError }] = await Promise.all([
      admin.from("cmp_Users").select("User_Firstname,User_Lastname,User_Email,User_JobTitle,Auth_User_ID,User_ProfilePhotoBucket,User_ProfilePhotoPath").eq("User_ID", card.Owner_User_ID).eq("Company_ID", card.Company_ID).maybeSingle(),
      admin.from("cmp_Company").select("Company_Name").eq("Company_ID", card.Company_ID).maybeSingle(),
    ])
    if (ownerError) throw new HttpError(500, ownerError.message)
    if (companyError) throw new HttpError(500, companyError.message)
    if (!owner) throw new HttpError(404, "This contact card is not active.")

    const authUser = owner.Auth_User_ID
      ? (await admin.auth.admin.getUserById(owner.Auth_User_ID)).data.user
      : null
    const metadata = authUser?.user_metadata as Record<string, unknown> | undefined
    const storedName = [owner.User_Firstname, owner.User_Lastname].filter(Boolean).join(" ").trim()
    let profileImageDataUrl: string | null = null

    if (owner.User_ProfilePhotoBucket === "profile-photos" && owner.User_ProfilePhotoPath) {
      const { data: signedPhoto, error: signedPhotoError } = await admin.storage
        .from("profile-photos")
        .createSignedUrl(owner.User_ProfilePhotoPath, 900)
      if (signedPhotoError) console.warn("The published contact card photo could not be signed.", signedPhotoError.message)
      profileImageDataUrl = signedPhoto?.signedUrl ?? null
    }

    return json(request, {
      fullName: metadataText(metadata, ["full_name", "name", "display_name"]) || storedName || owner.User_Email,
      role: owner.User_JobTitle?.trim() || metadataText(metadata, ["role_title", "roleTitle", "title"]),
      company: company?.Company_Name?.trim() || "",
      email: owner.User_Email,
      phone: card.ContactCard_ShowPhone ? metadataText(metadata, ["phone", "phone_number", "mobile"]) || authUser?.phone?.trim() || "" : "",
      website: card.ContactCard_ShowWebsite ? metadataText(metadata, ["website", "website_url"]) : "",
      profileImageDataUrl,
    })
  } catch (error) {
    return failure(request, error)
  }
})
