using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Legal FIATA/FBL document header. Links to Job_* operational data but stores issue snapshots for legal document stability.
/// </summary>
public partial class BlHeader
{
    public Guid BlId { get; set; }

    public Guid? BlJobId { get; set; }

    public string? BlNumber { get; set; }

    public string BlDocumentType { get; set; } = null!;

    public string BlStatus { get; set; } = null!;

    public DateTime? BlIssueDateTime { get; set; }

    public DateOnly BlDocumentDate { get; set; }

    public Guid? BlPlaceOfIssueLocationId { get; set; }

    public string? BlPlaceOfIssueSnapshot { get; set; }

    public int BlNumberOfOriginals { get; set; }

    public int BlNumberOfCopies { get; set; }

    public bool BlNegotiable { get; set; }

    public bool BlToOrder { get; set; }

    public Guid? BlFreightPayableAtLocationId { get; set; }

    public string? BlFreightPayableAtSnapshot { get; set; }

    public decimal? BlDeclaredValueAmount { get; set; }

    public Guid? BlDeclaredValueCurrencyId { get; set; }

    public bool BlInsuranceRequested { get; set; }

    public string? BlInsurancePolicyNumber { get; set; }

    public decimal? BlInsuredValueAmount { get; set; }

    public Guid? BlInsuredValueCurrencyId { get; set; }

    public string? BlStandardTermsVersion { get; set; }

    public string BlEfblrelease { get; set; } = null!;

    public string BlEfblpayload { get; set; } = null!;

    public string BlSourceSnapshot { get; set; } = null!;

    public string? BlNotes { get; set; }

    public DateTime BlCreatedAt { get; set; }

    public Guid? BlCreatedBy { get; set; }

    public DateTime BlUpdatedAt { get; set; }

    public Guid? BlUpdatedBy { get; set; }

    public DateTime? BlIssuedAt { get; set; }

    public Guid? BlIssuedBy { get; set; }

    public DateTime? BlCancelledAt { get; set; }

    public Guid? BlCancelledBy { get; set; }

    public string? BlCancellationReason { get; set; }

    public Guid? BlOrgOfficeId { get; set; }

    public Guid? BlLegalEntityId { get; set; }

    public Guid? BlBrandId { get; set; }

    public string? BlLegalEntityNameSnapshot { get; set; }

    public string? BlBrandNameSnapshot { get; set; }

    public virtual ICollection<BlAttachment> BlAttachments { get; set; } = new List<BlAttachment>();

    public virtual ICollection<BlAuditLog> BlAuditLogs { get; set; } = new List<BlAuditLog>();

    public virtual CmpBrand? BlBrand { get; set; }

    public virtual ICollection<BlCharge> BlCharges { get; set; } = new List<BlCharge>();

    public virtual ICollection<BlClause> BlClauses { get; set; } = new List<BlClause>();

    public virtual ICollection<BlEquipment> BlEquipments { get; set; } = new List<BlEquipment>();

    public virtual ICollection<BlGoodsItem> BlGoodsItems { get; set; } = new List<BlGoodsItem>();

    public virtual ICollection<BlHandlingInstruction> BlHandlingInstructions { get; set; } = new List<BlHandlingInstruction>();

    public virtual ICollection<BlIdentifier> BlIdentifiers { get; set; } = new List<BlIdentifier>();

    public virtual BlInsurance? BlInsurance { get; set; }

    public virtual JobHeader? BlJob { get; set; }

    public virtual CmpLegalEntity? BlLegalEntity { get; set; }

    public virtual ICollection<BlLocation> BlLocations { get; set; } = new List<BlLocation>();

    public virtual CmpOffice? BlOrgOffice { get; set; }

    public virtual ICollection<BlParty> BlParties { get; set; } = new List<BlParty>();

    public virtual BlSecurityControl? BlSecurityControl { get; set; }

    public virtual ICollection<BlSignature> BlSignatures { get; set; } = new List<BlSignature>();

    public virtual ICollection<BlStatusHistory> BlStatusHistories { get; set; } = new List<BlStatusHistory>();

    public virtual SysBldocumentStatus BlStatusNavigation { get; set; } = null!;

    public virtual ICollection<BlTransportMovement> BlTransportMovements { get; set; } = new List<BlTransportMovement>();

    public virtual ICollection<BlValidationResult> BlValidationResults { get; set; } = new List<BlValidationResult>();

    public virtual ICollection<BlVersion> BlVersions { get; set; } = new List<BlVersion>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsigRequest> DocsigRequests { get; set; } = new List<DocsigRequest>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();
}
