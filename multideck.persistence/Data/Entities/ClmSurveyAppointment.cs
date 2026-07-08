using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmSurveyAppointment
{
    public Guid ClmsurveyId { get; set; }

    public Guid? ClmsurveyIncidentId { get; set; }

    public Guid? ClmsurveyClaimId { get; set; }

    public Guid? ClmsurveySurveyorOrgId { get; set; }

    public Guid? ClmsurveySurveyorContactId { get; set; }

    public string ClmsurveyStatusCode { get; set; } = null!;

    public string? ClmsurveyLocationName { get; set; }

    public DateTime ClmsurveyRequestedAt { get; set; }

    public DateTime? ClmsurveyConfirmedAt { get; set; }

    public DateTime? ClmsurveyAppointmentAt { get; set; }

    public DateTime? ClmsurveyReportDueAt { get; set; }

    public DateTime? ClmsurveyReportReceivedAt { get; set; }

    public Guid? ClmsurveyReportEvidenceId { get; set; }

    public decimal ClmsurveyCostAmount { get; set; }

    public string ClmsurveyCurrencyCodeSnapshot { get; set; } = null!;

    public string? ClmsurveyNotes { get; set; }

    public Guid? ClmsurveyWorkflowTaskId { get; set; }

    public DateTime ClmsurveyCreatedAt { get; set; }

    public Guid? ClmsurveyCreatedBy { get; set; }

    public virtual ClmClaim? ClmsurveyClaim { get; set; }

    public virtual CmpUser? ClmsurveyCreatedByNavigation { get; set; }

    public virtual ClmIncident? ClmsurveyIncident { get; set; }

    public virtual ClmEvidenceItem? ClmsurveyReportEvidence { get; set; }

    public virtual SysClmnotificationStatus ClmsurveyStatusCodeNavigation { get; set; } = null!;

    public virtual OrgContact? ClmsurveySurveyorContact { get; set; }

    public virtual OrgMaster? ClmsurveySurveyorOrg { get; set; }

    public virtual WorkflowTask? ClmsurveyWorkflowTask { get; set; }
}
