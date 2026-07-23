using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsDeclaration
{
    public Guid CustId { get; set; }

    public Guid? CustJobId { get; set; }

    public Guid? CustOrgOfficeId { get; set; }

    public string? CustOfficeCodeSnapshot { get; set; }

    public string? CustOfficeNameSnapshot { get; set; }

    public string CustJurisdictionCode { get; set; } = null!;

    public string CustDirection { get; set; } = null!;

    public string CustDeclarationKind { get; set; } = null!;

    public string CustStatus { get; set; } = null!;

    public string? CustLocalReferenceNumber { get; set; }

    public string? CustCustomsReferenceNumber { get; set; }

    public string? CustMasterReferenceNumber { get; set; }

    public string? CustUcr { get; set; }

    public string? CustTraderReference { get; set; }

    public Guid? CustDeclarantOrgId { get; set; }

    public Guid? CustImporterOrgId { get; set; }

    public Guid? CustExporterOrgId { get; set; }

    public Guid? CustRepresentativeOrgId { get; set; }

    public Guid? CustCarrierOrgId { get; set; }

    public string? CustDeclarantIdentifierSnapshot { get; set; }

    public string? CustImporterIdentifierSnapshot { get; set; }

    public string? CustExporterIdentifierSnapshot { get; set; }

    public string? CustRepresentativeIdentifierSnapshot { get; set; }

    public string? CustCustomsOfficeOfLodgement { get; set; }

    public string? CustCustomsOfficeOfEntry { get; set; }

    public string? CustCustomsOfficeOfExit { get; set; }

    public string? CustCustomsOfficeOfDestination { get; set; }

    public string? CustGoodsLocationCode { get; set; }

    public string? CustCountryOfDispatchCodeSnapshot { get; set; }

    public string? CustCountryOfDestinationCodeSnapshot { get; set; }

    public int? CustTotalPackages { get; set; }

    public decimal? CustGrossMass { get; set; }

    public decimal? CustInvoiceAmount { get; set; }

    public string? CustInvoiceCurrencyCodeSnapshot { get; set; }

    public string? CustIncotermsCode { get; set; }

    public string? CustIncotermsLocation { get; set; }

    public string? CustICustomsExternalId { get; set; }

    public string? CustICustomsStatusSnapshot { get; set; }

    public string CustGenericPayloadJson { get; set; } = null!;

    public string CustSourceSnapshot { get; set; } = null!;

    public string? CustInternalNotes { get; set; }

    public DateTime CustCreatedAt { get; set; }

    public Guid? CustCreatedBy { get; set; }

    public DateTime CustUpdatedAt { get; set; }

    public Guid? CustUpdatedBy { get; set; }

    public bool CustIsDeleted { get; set; }

    public virtual CdsDeclaration? CdsDeclaration { get; set; }

    public virtual SysCustomsDeclarationKind CustDeclarationKindNavigation { get; set; } = null!;

    public virtual SysCustomsDeclarationDirection CustDirectionNavigation { get; set; } = null!;

    public virtual JobHeader? CustJob { get; set; }

    public virtual SysCustomsJurisdiction CustJurisdictionCodeNavigation { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus CustStatusNavigation { get; set; } = null!;

    public virtual ICollection<CustomsAttachment> CustomsAttachments { get; set; } = new List<CustomsAttachment>();

    public virtual ICollection<CustomsAuditLog> CustomsAuditLogs { get; set; } = new List<CustomsAuditLog>();

    public virtual ICollection<CustomsDataElement> CustomsDataElements { get; set; } = new List<CustomsDataElement>();

    public virtual ICollection<CustomsDocument> CustomsDocuments { get; set; } = new List<CustomsDocument>();

    public virtual ICollection<CustomsItem> CustomsItems { get; set; } = new List<CustomsItem>();

    public virtual ICollection<CustomsParty> CustomsParties { get; set; } = new List<CustomsParty>();

    public virtual ICollection<CustomsStatusHistory> CustomsStatusHistories { get; set; } = new List<CustomsStatusHistory>();

    public virtual ICollection<CustomsValidationResult> CustomsValidationResults { get; set; } = new List<CustomsValidationResult>();

    public virtual ICollection<CustomsVersion> CustomsVersions { get; set; } = new List<CustomsVersion>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();

    public virtual T1Declaration? T1Declaration { get; set; }
}
