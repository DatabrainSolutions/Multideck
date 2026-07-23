using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobDocument
{
    public Guid JobDocId { get; set; }

    public Guid JobDocJobId { get; set; }

    public Guid? JobDocDocTypeId { get; set; }

    public string? JobDocDocTypeCodeSnapshot { get; set; }

    public string JobDocTitle { get; set; } = null!;

    public string? JobDocDescription { get; set; }

    public string JobDocStatus { get; set; } = null!;

    public string? JobDocSource { get; set; }

    public string? JobDocFileName { get; set; }

    public string? JobDocFilePath { get; set; }

    public string? JobDocFileUrl { get; set; }

    public string? JobDocFileMimeType { get; set; }

    public long? JobDocFileSizeBytes { get; set; }

    public int JobDocVersionNo { get; set; }

    public bool JobDocIsCurrentVersion { get; set; }

    public string? JobDocExternalReference { get; set; }

    public DateTime? JobDocIssuedAt { get; set; }

    public DateTime? JobDocExpiresAt { get; set; }

    public DateOnly? JobDocDocumentDate { get; set; }

    public DateTime? JobDocReceivedAt { get; set; }

    public string JobDocMetadataJson { get; set; } = null!;

    public DateTime JobDocCreatedAt { get; set; }

    public Guid? JobDocCreatedBy { get; set; }

    public DateTime JobDocUpdatedAt { get; set; }

    public Guid? JobDocUpdatedBy { get; set; }

    public bool JobDocIsDeleted { get; set; }

    public virtual ICollection<AiDocumentExtraction> AiDocumentExtractions { get; set; } = new List<AiDocumentExtraction>();

    public virtual ICollection<AwbAttachment> AwbAttachments { get; set; } = new List<AwbAttachment>();

    public virtual ICollection<AwbRelatedDocument> AwbRelatedDocuments { get; set; } = new List<AwbRelatedDocument>();

    public virtual ICollection<BlAttachment> BlAttachments { get; set; } = new List<BlAttachment>();

    public virtual ICollection<CdsAttachment> CdsAttachments { get; set; } = new List<CdsAttachment>();

    public virtual ICollection<CdsDocument> CdsDocuments { get; set; } = new List<CdsDocument>();

    public virtual ICollection<ClmClaimDocument> ClmClaimDocuments { get; set; } = new List<ClmClaimDocument>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmPolicyDocument> ClmPolicyDocuments { get; set; } = new List<ClmPolicyDocument>();

    public virtual ICollection<CommMessageAttachment> CommMessageAttachments { get; set; } = new List<CommMessageAttachment>();

    public virtual ICollection<CustomsAttachment> CustomsAttachments { get; set; } = new List<CustomsAttachment>();

    public virtual ICollection<CustomsDocument> CustomsDocuments { get; set; } = new List<CustomsDocument>();

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocsecDocumentFingerprint> DocsecDocumentFingerprints { get; set; } = new List<DocsecDocumentFingerprint>();

    public virtual ICollection<DocsecDocumentMark> DocsecDocumentMarks { get; set; } = new List<DocsecDocumentMark>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsigRequest> DocsigRequests { get; set; } = new List<DocsigRequest>();

    public virtual SysDocType? JobDocDocType { get; set; }

    public virtual JobHeader JobDocJob { get; set; } = null!;

    public virtual SysJobDocumentStatus JobDocStatusNavigation { get; set; } = null!;

    public virtual ICollection<JobDocumentLink> JobDocumentLinks { get; set; } = new List<JobDocumentLink>();

    public virtual ICollection<MdxSharedDocument> MdxSharedDocuments { get; set; } = new List<MdxSharedDocument>();

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<T1Attachment> T1Attachments { get; set; } = new List<T1Attachment>();

    public virtual ICollection<T1Document> T1Documents { get; set; } = new List<T1Document>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();
}
