using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsDeclaration
{
    public Guid CdsId { get; set; }

    public Guid? CdsCustomsId { get; set; }

    public Guid? CdsJobId { get; set; }

    public Guid? CdsOrgOfficeId { get; set; }

    public string? CdsOfficeCodeSnapshot { get; set; }

    public string? CdsOfficeNameSnapshot { get; set; }

    public string CdsDirection { get; set; } = null!;

    public string CdsDeclarationKind { get; set; } = null!;

    public string? CdsDeclarationCategory { get; set; }

    public string CdsStatus { get; set; } = null!;

    public string? CdsLrn { get; set; }

    public string? CdsMrn { get; set; }

    public string? CdsDucr { get; set; }

    public string? CdsMucr { get; set; }

    public string? CdsUcr { get; set; }

    public string? CdsInventoryReference { get; set; }

    public string? CdsBadgeId { get; set; }

    public Guid? CdsDeclarantOrgId { get; set; }

    public Guid? CdsRepresentativeOrgId { get; set; }

    public Guid? CdsImporterOrgId { get; set; }

    public Guid? CdsExporterOrgId { get; set; }

    public Guid? CdsConsignorOrgId { get; set; }

    public Guid? CdsConsigneeOrgId { get; set; }

    public string? CdsDeclarantEorisnapshot { get; set; }

    public string? CdsRepresentativeEorisnapshot { get; set; }

    public string? CdsImporterEorisnapshot { get; set; }

    public string? CdsExporterEorisnapshot { get; set; }

    public DateTime? CdsAcceptanceDateTime { get; set; }

    public DateTime? CdsClearanceDateTime { get; set; }

    public DateTime? CdsReleaseDateTime { get; set; }

    public DateTime? CdsSubmissionDeadline { get; set; }

    public string? CdsGoodsLocationCode { get; set; }

    public string? CdsDeclarationOfficeCode { get; set; }

    public string? CdsExportOfficeCode { get; set; }

    public string? CdsExitOfficeCode { get; set; }

    public int? CdsTotalPackages { get; set; }

    public decimal? CdsGrossMass { get; set; }

    public decimal? CdsInvoiceAmount { get; set; }

    public string? CdsInvoiceCurrencyCodeSnapshot { get; set; }

    public string? CdsIncotermsCode { get; set; }

    public string? CdsIncotermsLocation { get; set; }

    public string? CdsICustomsExternalId { get; set; }

    public string? CdsICustomsStatusSnapshot { get; set; }

    public string CdsPayloadJson { get; set; } = null!;

    public string CdsSourceSnapshot { get; set; } = null!;

    public string? CdsInternalNotes { get; set; }

    public DateTime CdsCreatedAt { get; set; }

    public Guid? CdsCreatedBy { get; set; }

    public DateTime CdsUpdatedAt { get; set; }

    public Guid? CdsUpdatedBy { get; set; }

    public bool CdsIsDeleted { get; set; }

    public virtual ICollection<CdsAdditionalInformation> CdsAdditionalInformations { get; set; } = new List<CdsAdditionalInformation>();

    public virtual ICollection<CdsAttachment> CdsAttachments { get; set; } = new List<CdsAttachment>();

    public virtual ICollection<CdsAuditLog> CdsAuditLogs { get; set; } = new List<CdsAuditLog>();

    public virtual ICollection<CdsContainer> CdsContainers { get; set; } = new List<CdsContainer>();

    public virtual CustomsDeclaration? CdsCustoms { get; set; }

    public virtual ICollection<CdsDataElement> CdsDataElements { get; set; } = new List<CdsDataElement>();

    public virtual SysCdsdeclarationCategory? CdsDeclarationCategoryNavigation { get; set; }

    public virtual SysCustomsDeclarationKind CdsDeclarationKindNavigation { get; set; } = null!;

    public virtual SysCustomsDeclarationDirection CdsDirectionNavigation { get; set; } = null!;

    public virtual ICollection<CdsDocument> CdsDocuments { get; set; } = new List<CdsDocument>();

    public virtual CdsExportDetail? CdsExportDetail { get; set; }

    public virtual ICollection<CdsGuarantee> CdsGuarantees { get; set; } = new List<CdsGuarantee>();

    public virtual CdsImportDetail? CdsImportDetail { get; set; }

    public virtual ICollection<CdsItem> CdsItems { get; set; } = new List<CdsItem>();

    public virtual JobHeader? CdsJob { get; set; }

    public virtual ICollection<CdsLocation> CdsLocations { get; set; } = new List<CdsLocation>();

    public virtual ICollection<CdsPackage> CdsPackages { get; set; } = new List<CdsPackage>();

    public virtual ICollection<CdsParty> CdsParties { get; set; } = new List<CdsParty>();

    public virtual ICollection<CdsStatusHistory> CdsStatusHistories { get; set; } = new List<CdsStatusHistory>();

    public virtual SysCustomsDeclarationStatus CdsStatusNavigation { get; set; } = null!;

    public virtual ICollection<CdsTaxis> CdsTaxes { get; set; } = new List<CdsTaxis>();

    public virtual ICollection<CdsTransport> CdsTransports { get; set; } = new List<CdsTransport>();

    public virtual ICollection<CdsValidationResult> CdsValidationResults { get; set; } = new List<CdsValidationResult>();

    public virtual ICollection<CdsValuationAdjustment> CdsValuationAdjustments { get; set; } = new List<CdsValuationAdjustment>();

    public virtual ICollection<CdsVersion> CdsVersions { get; set; } = new List<CdsVersion>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();
}
