import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const lightbox = source("../src/components/multideck/image-lightbox.tsx")
const support = source("../src/components/multideck/support-ticket-dialog.tsx")
const dexterComposer = source("../src/components/multideck/agent-dexter-components.tsx")
const dexterPage = source("../src/pages/agent-dexter-page.tsx")
const homeDexter = source("../src/components/multideck/home-dexter-launcher.tsx")
const inbox = source("../src/pages/inbox-page.tsx")
const mailComposer = source("../src/components/multideck/mail-composer.tsx")
const dexterEmailAttachment = source("../src/components/multideck/dexter-email-attachment-card.tsx")
const quoteResponse = source("../src/pages/quote-response-page.tsx")
const galleryData = source("../src/data/multideck-data.ts")
const galleryPage = source("../src/pages/components-gallery-page.tsx")

test("the shared image lightbox preserves identity, focus, navigation and reduced motion", () => {
  assert.match(lightbox, /type ImageLightboxPhase = "closed" \| "opening" \| "open" \| "closing"/)
  assert.match(lightbox, /layoutId=\{`image-preview-\$\{activeItem\.id\}`\}/)
  assert.match(lightbox, /returnFocusIdRef\.current = activeItem\.id/)
  assert.match(lightbox, /triggerRefs\.current\.get\(id\)\?\.focus\(\)/)
  assert.match(lightbox, /event\.key === "ArrowLeft"[\s\S]*?move\(-1\)/)
  assert.match(lightbox, /event\.key === "ArrowRight"[\s\S]*?move\(1\)/)
  assert.match(lightbox, /bg-black\/76/)
  assert.match(lightbox, /setPhase\(reducedMotion \? "open" : "opening"\)/)
  assert.match(lightbox, /setPhase\("closing"\)[\s\S]*?200/)
})

test("every attachment image surface uses the same square preview and viewer", () => {
  assert.match(support, /<ImageLightbox[\s\S]*?SupportTicketAttachmentPreview/)
  assert.match(dexterComposer, /function DexterImageAttachmentPreview[\s\S]*?<ImageLightbox items=\{imageLightboxItems\}>/)
  assert.match(dexterPage, /previewUrl: document\.previewUrl/)
  assert.match(dexterPage, /file\.type\.startsWith\("image\/"\) \? URL\.createObjectURL\(file\)/)
  assert.match(homeDexter, /previewOwnershipTransferredRef[\s\S]*?previewUrl: document\.previewUrl/)
  assert.match(inbox, /function MessageAttachments[\s\S]*?<ImageLightbox items=\{lightboxItems\}>/)
  assert.match(mailComposer, /function ImageAttachmentCard[\s\S]*?<ImageLightbox items=\{imageLightboxItems\}>/)
  assert.match(dexterEmailAttachment, /<ImageLightbox items=\{imageLightboxItems\}>/)
  assert.match(quoteResponse, /<ImageLightbox items=\{\[\{/)

  for (const file of [support, dexterComposer, inbox, mailComposer, dexterEmailAttachment, quoteResponse]) {
    assert.match(file, /object-cover/)
    assert.match(file, /layoutId=\{[^}]*layoutIdFor/)
  }
})

test("the reusable image lightbox is documented and inspectable in Components", () => {
  assert.match(galleryData, /id: "image-lightbox"/)
  assert.match(galleryData, /route: "\/agent-dexter"/)
  assert.match(galleryData, /route: "\/inbox"/)
  assert.match(galleryPage, /id === "image-lightbox"/)
  assert.match(galleryPage, /galleryLightboxItems\.map/)
})
