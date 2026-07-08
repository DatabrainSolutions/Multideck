using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Primary AWB/e-AWB document record. Stores legal print snapshots and electronic message payload references.
/// </summary>
public partial class AwbHeader
{
    public Guid AwbId { get; set; }

    public Guid? AwbJobId { get; set; }

    public Guid? AwbCompanyLegalEntityOrgId { get; set; }

    public Guid? AwbOrgOfficeId { get; set; }

    public string? AwbOfficeCodeSnapshot { get; set; }

    public string? AwbOfficeNameSnapshot { get; set; }

    public Guid? AwbCompanyIataregistrationId { get; set; }

    public string? AwbCompanyIatacodeSnapshot { get; set; }

    public string? AwbCompanyCassaccountSnapshot { get; set; }

    public string? AwbDataResidencyRegion { get; set; }

    public string AwbTimeZone { get; set; } = null!;

    public string? AwbNumber { get; set; }

    public string? AwbPrefix { get; set; }

    public string? AwbSerialNumber { get; set; }

    public string? AwbCheckDigit { get; set; }

    public string AwbDocumentType { get; set; } = null!;

    public string AwbAwbtype { get; set; } = null!;

    public string AwbStatus { get; set; } = null!;

    public DateOnly AwbDocumentDate { get; set; }

    public DateTime? AwbIssueDateTime { get; set; }

    public bool AwbEAwbindicator { get; set; }

    public string? AwbEawbcode { get; set; }

    public string? AwbCargoXmlversion { get; set; }

    public string? AwbCargoXmlmessageType { get; set; }

    public string? AwbCargoXmlmessageId { get; set; }

    public string AwbCargoXmlpayload { get; set; } = null!;

    public string AwbOnerecordPayload { get; set; } = null!;

    public string AwbSourceSnapshot { get; set; } = null!;

    public Guid? AwbOriginAirportId { get; set; }

    public string? AwbOriginAirportCodeSnapshot { get; set; }

    public string? AwbOriginAirportNameSnapshot { get; set; }

    public Guid? AwbDestinationAirportId { get; set; }

    public string? AwbDestinationAirportCodeSnapshot { get; set; }

    public string? AwbDestinationAirportNameSnapshot { get; set; }

    public string? AwbRequestedRoutingText { get; set; }

    public Guid? AwbCarrierOrgId { get; set; }

    public string? AwbCarrierNameSnapshot { get; set; }

    public string? AwbCarrierIatacodeSnapshot { get; set; }

    public Guid? AwbIssuingCarrierAgentOrgId { get; set; }

    public string? AwbIssuingCarrierAgentNameSnapshot { get; set; }

    public string? AwbIssuingCarrierAgentIatacodeSnapshot { get; set; }

    public string? AwbIssuingCarrierAgentAccountSnapshot { get; set; }

    public string? AwbAccountingInformation { get; set; }

    public string? AwbShippersCertificationText { get; set; }

    public string? AwbHandlingInformation { get; set; }

    public string? AwbChargeDeclarationPrepaidCollect { get; set; }

    public string? AwbWeightChargePrepaidCollect { get; set; }

    public string? AwbOtherChargesPrepaidCollect { get; set; }

    public decimal? AwbDeclaredValueForCarriageAmount { get; set; }

    public Guid? AwbDeclaredValueForCarriageCurrencyId { get; set; }

    public string? AwbDeclaredValueForCarriageCurrencyCodeSnapshot { get; set; }

    public decimal? AwbDeclaredValueForCustomsAmount { get; set; }

    public Guid? AwbDeclaredValueForCustomsCurrencyId { get; set; }

    public string? AwbDeclaredValueForCustomsCurrencyCodeSnapshot { get; set; }

    public decimal? AwbInsuranceAmount { get; set; }

    public Guid? AwbInsuranceCurrencyId { get; set; }

    public string? AwbInsuranceCurrencyCodeSnapshot { get; set; }

    public DateOnly? AwbExecutedOnDate { get; set; }

    public string? AwbExecutedAtPlace { get; set; }

    public string? AwbExecutedByName { get; set; }

    public string? AwbExecutedByRole { get; set; }

    public string? AwbPrintTemplateVersion { get; set; }

    public string? AwbInternalNotes { get; set; }

    public DateTime AwbCreatedAt { get; set; }

    public Guid? AwbCreatedBy { get; set; }

    public DateTime AwbUpdatedAt { get; set; }

    public Guid? AwbUpdatedBy { get; set; }

    public bool AwbIsDeleted { get; set; }

    public Guid? AwbLegalEntityId { get; set; }

    public Guid? AwbBrandId { get; set; }

    public string? AwbLegalEntityNameSnapshot { get; set; }

    public string? AwbBrandNameSnapshot { get; set; }

    public virtual ICollection<AwbAttachment> AwbAttachments { get; set; } = new List<AwbAttachment>();

    public virtual ICollection<AwbAuditLog> AwbAuditLogs { get; set; } = new List<AwbAuditLog>();

    public virtual CmpBrand? AwbBrand { get; set; }

    public virtual SysAwbprepaidCollectType? AwbChargeDeclarationPrepaidCollectNavigation { get; set; }

    public virtual AwbChargeSummary? AwbChargeSummary { get; set; }

    public virtual ICollection<AwbCharge> AwbCharges { get; set; } = new List<AwbCharge>();

    public virtual AwbCompanyIataregistration? AwbCompanyIataregistration { get; set; }

    public virtual ICollection<AwbCustomsInformation> AwbCustomsInformations { get; set; } = new List<AwbCustomsInformation>();

    public virtual ICollection<AwbDangerousGood> AwbDangerousGoods { get; set; } = new List<AwbDangerousGood>();

    public virtual ICollection<AwbDimension> AwbDimensions { get; set; } = new List<AwbDimension>();

    public virtual SysAwbspecialHandlingCode? AwbEawbcodeNavigation { get; set; }

    public virtual ICollection<AwbGoodsItem> AwbGoodsItems { get; set; } = new List<AwbGoodsItem>();

    public virtual ICollection<AwbIdentifier> AwbIdentifiers { get; set; } = new List<AwbIdentifier>();

    public virtual JobHeader? AwbJob { get; set; }

    public virtual CmpLegalEntity? AwbLegalEntity { get; set; }

    public virtual ICollection<AwbLocation> AwbLocations { get; set; } = new List<AwbLocation>();

    public virtual SysAwbprepaidCollectType? AwbOtherChargesPrepaidCollectNavigation { get; set; }

    public virtual ICollection<AwbParty> AwbParties { get; set; } = new List<AwbParty>();

    public virtual ICollection<AwbRateLine> AwbRateLines { get; set; } = new List<AwbRateLine>();

    public virtual ICollection<AwbRelatedDocument> AwbRelatedDocumentAwbrdAwbs { get; set; } = new List<AwbRelatedDocument>();

    public virtual ICollection<AwbRelatedDocument> AwbRelatedDocumentAwbrdRelatedAwbs { get; set; } = new List<AwbRelatedDocument>();

    public virtual ICollection<AwbRoutingLeg> AwbRoutingLegs { get; set; } = new List<AwbRoutingLeg>();

    public virtual ICollection<AwbSecurityScreening> AwbSecurityScreenings { get; set; } = new List<AwbSecurityScreening>();

    public virtual ICollection<AwbSignature> AwbSignatures { get; set; } = new List<AwbSignature>();

    public virtual ICollection<AwbSpecialHandling> AwbSpecialHandlings { get; set; } = new List<AwbSpecialHandling>();

    public virtual ICollection<AwbStatusHistory> AwbStatusHistories { get; set; } = new List<AwbStatusHistory>();

    public virtual SysAwbdocumentStatus AwbStatusNavigation { get; set; } = null!;

    public virtual ICollection<AwbValidationResult> AwbValidationResults { get; set; } = new List<AwbValidationResult>();

    public virtual ICollection<AwbVersion> AwbVersions { get; set; } = new List<AwbVersion>();

    public virtual SysAwbprepaidCollectType? AwbWeightChargePrepaidCollectNavigation { get; set; }

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();
}
