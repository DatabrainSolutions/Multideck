using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaim
{
    public Guid ClmclaimId { get; set; }

    public string ClmclaimNumber { get; set; } = null!;

    public Guid? ClmclaimIncidentId { get; set; }

    public Guid? ClmclaimPolicyId { get; set; }

    public Guid? ClmclaimJobId { get; set; }

    public Guid? ClmclaimJobRouteId { get; set; }

    public Guid? ClmclaimJobCargoId { get; set; }

    public Guid? ClmclaimJobContainerId { get; set; }

    public Guid? ClmclaimOrgOfficeId { get; set; }

    public Guid? ClmclaimLegalEntityId { get; set; }

    public Guid? ClmclaimBrandId { get; set; }

    public Guid? ClmclaimCustomerOrgId { get; set; }

    public string ClmclaimTypeCode { get; set; } = null!;

    public string ClmclaimStatusCode { get; set; } = null!;

    public string ClmclaimLiabilityStatusCode { get; set; } = null!;

    public string? ClmclaimCauseCode { get; set; }

    public string ClmclaimTitle { get; set; } = null!;

    public Guid? ClmclaimClaimantOrgId { get; set; }

    public Guid? ClmclaimRespondentOrgId { get; set; }

    public Guid? ClmclaimInsurerOrgId { get; set; }

    public Guid? ClmclaimBrokerOrgId { get; set; }

    public Guid? ClmclaimAdjusterOrgId { get; set; }

    public Guid? ClmclaimSurveyorOrgId { get; set; }

    public DateTime? ClmclaimReceivedAt { get; set; }

    public DateTime? ClmclaimNotifiedAt { get; set; }

    public DateTime? ClmclaimSubmittedAt { get; set; }

    public DateTime? ClmclaimAcknowledgedAt { get; set; }

    public DateOnly? ClmclaimLimitationDate { get; set; }

    public DateTime? ClmclaimSettledAt { get; set; }

    public DateTime? ClmclaimClosedAt { get; set; }

    public string ClmclaimCurrencyCodeSnapshot { get; set; } = null!;

    public decimal ClmclaimClaimedAmount { get; set; }

    public decimal ClmclaimAcceptedAmount { get; set; }

    public decimal ClmclaimRejectedAmount { get; set; }

    public decimal ClmclaimDeductibleAmount { get; set; }

    public decimal ClmclaimReserveAmount { get; set; }

    public decimal ClmclaimExpenseReserveAmount { get; set; }

    public decimal ClmclaimRecoveryExpectedAmount { get; set; }

    public decimal ClmclaimRecoveryReceivedAmount { get; set; }

    public decimal ClmclaimSettlementAmount { get; set; }

    public decimal ClmclaimLocalClaimedAmount { get; set; }

    public decimal ClmclaimExchangeRate { get; set; }

    public string? ClmclaimLossDescription { get; set; }

    public string? ClmclaimLiabilityBasis { get; set; }

    public string? ClmclaimCustomerPosition { get; set; }

    public string? ClmclaimAistatusSummary { get; set; }

    public decimal? ClmclaimAiriskScore { get; set; }

    public string ClmclaimMetadataJson { get; set; } = null!;

    public Guid? ClmclaimOwnerUserId { get; set; }

    public DateTime ClmclaimCreatedAt { get; set; }

    public Guid? ClmclaimCreatedBy { get; set; }

    public DateTime ClmclaimUpdatedAt { get; set; }

    public Guid? ClmclaimUpdatedBy { get; set; }

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovals { get; set; } = new List<ClmClaimApproval>();

    public virtual ICollection<ClmClaimDocument> ClmClaimDocuments { get; set; } = new List<ClmClaimDocument>();

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmClaimFinancialLink> ClmClaimFinancialLinks { get; set; } = new List<ClmClaimFinancialLink>();

    public virtual ICollection<ClmClaimLine> ClmClaimLines { get; set; } = new List<ClmClaimLine>();

    public virtual ICollection<ClmClaimParty> ClmClaimParties { get; set; } = new List<ClmClaimParty>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmClaimReserf> ClmClaimReserves { get; set; } = new List<ClmClaimReserf>();

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual OrgMaster? ClmclaimAdjusterOrg { get; set; }

    public virtual CmpBrand? ClmclaimBrand { get; set; }

    public virtual OrgMaster? ClmclaimBrokerOrg { get; set; }

    public virtual SysClmcauseCode? ClmclaimCauseCodeNavigation { get; set; }

    public virtual OrgMaster? ClmclaimClaimantOrg { get; set; }

    public virtual CmpUser? ClmclaimCreatedByNavigation { get; set; }

    public virtual OrgMaster? ClmclaimCustomerOrg { get; set; }

    public virtual ClmIncident? ClmclaimIncident { get; set; }

    public virtual OrgMaster? ClmclaimInsurerOrg { get; set; }

    public virtual JobHeader? ClmclaimJob { get; set; }

    public virtual JobCargo? ClmclaimJobCargo { get; set; }

    public virtual JobContainer? ClmclaimJobContainer { get; set; }

    public virtual JobRouting? ClmclaimJobRoute { get; set; }

    public virtual CmpLegalEntity? ClmclaimLegalEntity { get; set; }

    public virtual SysClmliabilityStatus ClmclaimLiabilityStatusCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? ClmclaimOrgOffice { get; set; }

    public virtual CmpUser? ClmclaimOwnerUser { get; set; }

    public virtual ClmInsurancePolicy? ClmclaimPolicy { get; set; }

    public virtual OrgMaster? ClmclaimRespondentOrg { get; set; }

    public virtual SysClmclaimStatus ClmclaimStatusCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? ClmclaimSurveyorOrg { get; set; }

    public virtual SysClmclaimType ClmclaimTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? ClmclaimUpdatedByNavigation { get; set; }
}
