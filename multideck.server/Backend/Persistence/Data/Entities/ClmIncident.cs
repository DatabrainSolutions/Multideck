using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmIncident
{
    public Guid ClmincidentId { get; set; }

    public string ClmincidentNumber { get; set; } = null!;

    public Guid? ClmincidentJobId { get; set; }

    public Guid? ClmincidentJobRouteId { get; set; }

    public Guid? ClmincidentJobCargoId { get; set; }

    public Guid? ClmincidentJobContainerId { get; set; }

    public Guid? ClmincidentTrackingEventId { get; set; }

    public Guid? ClmincidentTrackingExceptionId { get; set; }

    public Guid? ClmincidentOrgOfficeId { get; set; }

    public Guid? ClmincidentLegalEntityId { get; set; }

    public Guid? ClmincidentBrandId { get; set; }

    public Guid? ClmincidentCustomerOrgId { get; set; }

    public string ClmincidentTypeCode { get; set; } = null!;

    public string ClmincidentStatusCode { get; set; } = null!;

    public string ClmincidentSeverityCode { get; set; } = null!;

    public string? ClmincidentCauseCode { get; set; }

    public string ClmincidentTitle { get; set; } = null!;

    public string? ClmincidentDescription { get; set; }

    public string? ClmincidentImmediateAction { get; set; }

    public DateTime? ClmincidentOccurredAt { get; set; }

    public DateTime ClmincidentReportedAt { get; set; }

    public DateTime? ClmincidentClosedAt { get; set; }

    public string? ClmincidentLocationName { get; set; }

    public string? ClmincidentUnlocode { get; set; }

    public string? ClmincidentCountryCode { get; set; }

    public decimal ClmincidentPotentialClaimAmount { get; set; }

    public decimal ClmincidentEstimatedLossAmount { get; set; }

    public string ClmincidentCurrencyCodeSnapshot { get; set; } = null!;

    public bool ClmincidentIsCustomerVisible { get; set; }

    public bool ClmincidentHasClaim { get; set; }

    public string? ClmincidentRootCauseSummary { get; set; }

    public string? ClmincidentAistatusSummary { get; set; }

    public string ClmincidentMetadataJson { get; set; } = null!;

    public Guid? ClmincidentOwnerUserId { get; set; }

    public DateTime ClmincidentCreatedAt { get; set; }

    public Guid? ClmincidentCreatedBy { get; set; }

    public DateTime ClmincidentUpdatedAt { get; set; }

    public Guid? ClmincidentUpdatedBy { get; set; }

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActions { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<ClmIncidentCargoItem> ClmIncidentCargoItems { get; set; } = new List<ClmIncidentCargoItem>();

    public virtual ICollection<ClmIncidentParty> ClmIncidentParties { get; set; } = new List<ClmIncidentParty>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual CmpBrand? ClmincidentBrand { get; set; }

    public virtual SysClmcauseCode? ClmincidentCauseCodeNavigation { get; set; }

    public virtual CmpUser? ClmincidentCreatedByNavigation { get; set; }

    public virtual OrgMaster? ClmincidentCustomerOrg { get; set; }

    public virtual JobHeader? ClmincidentJob { get; set; }

    public virtual JobCargo? ClmincidentJobCargo { get; set; }

    public virtual JobContainer? ClmincidentJobContainer { get; set; }

    public virtual JobRouting? ClmincidentJobRoute { get; set; }

    public virtual CmpLegalEntity? ClmincidentLegalEntity { get; set; }

    public virtual CmpOffice? ClmincidentOrgOffice { get; set; }

    public virtual CmpUser? ClmincidentOwnerUser { get; set; }

    public virtual SysClmseverityLevel ClmincidentSeverityCodeNavigation { get; set; } = null!;

    public virtual SysClmincidentStatus ClmincidentStatusCodeNavigation { get; set; } = null!;

    public virtual JobTrackingEvent? ClmincidentTrackingEvent { get; set; }

    public virtual JobTrackingException? ClmincidentTrackingException { get; set; }

    public virtual SysClmincidentType ClmincidentTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? ClmincidentUpdatedByNavigation { get; set; }
}
